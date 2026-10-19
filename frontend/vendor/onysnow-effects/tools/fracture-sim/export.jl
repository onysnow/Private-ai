# Compact a break's exports for the Python tools (broken glass B0).
#
# Reads out/<name>/vtk/pane_timestep_*.pvtu and writes out/<name>/points.f32: one row
# per point, Float32, columns
#   x0 y0 z0        reference position, m
#   damage          final share of broken bonds, 0..1
#   t_crack         first time the point's damage passed 0.25, s (-1 if never)
#   ux uy uz        final displacement, m
# plus out/<name>/points.txt with the row count and the export times.
#
# Usage: julia --project=. export.jl <name>

using Peridynamics, Printf

function main(name)
    root = joinpath(@__DIR__, "out", name)
    dir = joinpath(root, "vtk")
    # A pane alone exports timestep_*; a pane with an impactor, pane_timestep_*.
    all = readdir(dir)
    prefix = any(f -> startswith(f, "pane_timestep_"), all) ? "pane_timestep_" : "timestep_"
    files = filter(f -> startswith(f, prefix) && endswith(f, ".pvtu"), all)
    steps = sort(parse.(Int, replace.(files, prefix => "", ".pvtu" => "")))
    isempty(steps) && error("no exports in $dir")

    first = read_vtk(joinpath(dir, "$(prefix)$(steps[1]).pvtu"))
    ref = first[:position] .- first[:displacement]
    n = size(ref, 2)
    tcrack = fill(-1.0, n)
    times = Float64[]
    last = first
    for s in steps
        r = read_vtk(joinpath(dir, "$(prefix)$(s).pvtu"))
        t = r[:time] isa AbstractArray ? r[:time][1] : r[:time]
        push!(times, t)
        d = r[:damage]
        @inbounds for i in 1:n
            if tcrack[i] < 0 && d[i] > 0.25
                tcrack[i] = t
            end
        end
        last = r
    end
    out = Matrix{Float32}(undef, 8, n)
    out[1:3, :] .= ref
    out[4, :] .= last[:damage]
    out[5, :] .= tcrack
    out[6:8, :] .= last[:displacement]
    write(joinpath(root, "points.f32"), out)
    open(joinpath(root, "points.txt"), "w") do io
        println(io, "rows=", n)
        println(io, "columns=x0,y0,z0,damage,t_crack,ux,uy,uz")
        println(io, "times=", join((@sprintf("%.4e", t) for t in times), ","))
    end
    cracked = count(>(0), tcrack)
    @printf("%s: %d points, %d exports, %d points cracked, final t %.1f us\n",
            name, n, length(steps), cracked, times[end] * 1e6)
end

main(ARGS[1])
