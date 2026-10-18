# One simulated break of a glass pane (broken glass B0, docs/broken-glass-system.md §3.1).
#
# Peridynamics.jl (MIT), ordinary state-based model, so glass's Poisson ratio (0.22)
# is honoured. The points are jittered (a regular grid breaks in kaleidoscope
# patterns) and each point's strength is drawn from a Weibull distribution, as real
# glass's strength is set by random flaws. A dense steel sphere carrying the
# impactor's whole mass strikes the pane.
#
# The default is the NIJ 241445 Series A test, so the result can be checked against
# the 60 panes measured there: a 203 x 203 x 3.2 mm pane lying on foam (free during
# the event) hit by a 965 g drop weight with a round tip at 4.9 m/s (a 4 ft drop).
#
# Usage (from this folder):
#   julia -t 2 --project=. break.jl name=nij-round-4ft speed=4.9 seed=1
# Every setting below can be given as key=value. Results go to out/<name>/.

using Peridynamics, Random, Printf

const DEFAULTS = Dict{String,Any}(
    "name" => "nij-round-4ft",
    # pane, m
    "lx" => 0.2032, "ly" => 0.2032, "t" => 0.0032, "dx" => 0.0008, "jitter" => 0.15,
    # soda-lime glass
    "E" => 72e9, "nu" => 0.22, "rho" => 2500.0,
    "Gc" => 8.0,            # J/m^2, from K_IC 0.75 MPa sqrt(m)
    "weibull_m" => 8.0,     # spread of point strengths (glass: 5-15)
    "classes" => 8,         # strength classes the Weibull spread is binned into
    # support: "free" (on foam, as NIJ Series A) or "frame": the outer frame_w held
    # in z (a glazing rebate), and the glass under and just inside the bead
    # (gasket_w) unbreakable, standing in for the rubber gasket that spreads the
    # clamp's load (a hard clamp on breakable glass cracks along its own line)
    "support" => "free", "frame_w" => 0.0127, "gasket_w" => 0.006,
    # impactor: a sphere carrying the whole mass
    "hammer_r" => 0.006, "hammer_mass" => 0.965, "speed" => 4.9,
    "hit_x" => 0.007, "hit_y" => -0.004,
    # "sphere": the impactor as a body in contact; "pulse": its contact force as a
    # Hertz-shaped pressure on the struck face, a half sine in time
    "impactor" => "sphere", "pulse_peak" => 5000.0, "pulse_time" => 150e-6, "pulse_r" => 0.0015,
    # "ram": a press. The glass under the ram's flat tip (a plug ram_r wide, the whole
    # thickness, unbreakable: it is in compression) is driven down at ram_speed, reached
    # over ram_ramp seconds -- displacement control, as a press is. The pane cracks at
    # its first flaw and the ram keeps pushing the hinged pieces, which bend on the frame
    # and break again, so the web grows outward with the travel, generation by generation,
    # whatever the glass's strength: the strength only sets the force and how soon.
    "ram_speed" => 1.0, "ram_r" => 0.005, "ram_ramp" => 1e-4,
    # "prestress": the pane starts bent, as a pane pressed slowly to failure is -- the
    # centre deflection in metres of a clamped plate's cos^2 bowl (0: flat). The bending
    # strain is already in it (Kirchhoff: in-plane -z grad w), so the cracks run on the
    # energy the press stored, not on a blow. The impactor can then be "none".
    "prestress" => 0.0,
    # The bent shape: "bowl" (a clamped plate's cos^2 dish: the strain spread over the pane,
    # which shatters it evenly like tempered glass) or "point" (a clamped circular plate
    # under a central point load, the ram: the curvature crowds round the centre, a star
    # and rings there, hogging at the clamp).
    "prestress_shape" => "point",
    # A bowl added under the point shape, metres: the whole pane strained a little short
    # of cracking, so the radials that run out of the centre's web find energy in the field
    # and branch there instead of running clean to the frame. 0: the point shape alone.
    "prestress_bowl" => 0.0,
    # contact: the penalty (Peridynamics.jl's default, 1e12, is ten times too soft
    # for a kilogram at 5 m/s: the impactor ploughed through the pane unslowed)
    "penalty" => 1e14,
    # time, s
    "time" => 450e-6, "freq" => 96,
    "seed" => 1,
)

function settings(args)
    s = copy(DEFAULTS)
    for a in args
        k, v = split(a, "="; limit=2)
        haskey(s, k) || error("unknown setting $k")
        d = s[k]
        s[k] = d isa String ? String(v) : d isa Int ? parse(Int, v) : parse(Float64, v)
    end
    return s
end

# Weibull quantiles at the middle of K equal-probability bins, scaled to mean 1.
function weibull_classes(m, K)
    q = [(-log(1 - (k - 0.5) / K))^(1 / m) for k in 1:K]
    return q ./ (sum(q) / K)
end

function main(args)
    s = settings(args)
    Random.seed!(s["seed"])
    dx = s["dx"]
    root = joinpath(@__DIR__, "out", s["name"])
    mkpath(root)

    # The pane, centred on the origin; the struck face is z = +t/2.
    pos, vol = uniform_box(s["lx"], s["ly"], s["t"], dx)
    pos .+= (rand(size(pos)...) .- 0.5) .* (2 * s["jitter"] * dx)
    pane = Body(OSBMaterial(), pos, vol)
    δ = 3.015dx
    base = (horizon=δ, rho=s["rho"], E=s["E"], nu=s["nu"])
    material!(pane; base..., Gc=s["Gc"])

    # Strength from random flaws: point strength w ~ Weibull(m), and strength goes as
    # sqrt(Gc), so each class gets Gc * w^2.
    w = weibull_classes(s["weibull_m"], s["classes"])
    cls = rand(1:s["classes"], size(pos, 2))
    for k in 1:s["classes"]
        set = Symbol("w$k")
        point_set!(pane, set, findall(==(k), cls))
        material!(pane, set; base..., Gc=s["Gc"] * w[k]^2)
    end

    if s["support"] == "frame"
        hx = s["lx"] / 2 - s["frame_w"]
        hy = s["ly"] / 2 - s["frame_w"]
        point_set!(p -> abs(p[1]) > hx || abs(p[2]) > hy, pane, :frame)
        velocity_bc!(t -> 0.0, pane, :frame, :z)
        gx = hx - s["gasket_w"]
        gy = hy - s["gasket_w"]
        point_set!(p -> abs(p[1]) > gx || abs(p[2]) > gy, pane, :gasket)
        no_failure!(pane, :gasket)
    end

    if s["prestress"] > 0
        w0 = s["prestress"]
        sx = s["lx"] / 2 - s["frame_w"]
        sy = s["ly"] / 2 - s["frame_w"]
        # The clamped plate's cos^2 dish of centre depth w: w(x, y) and its slopes.
        dish = w -> (
            (x, y) -> (abs(x) < sx && abs(y) < sy) ? w * cos(pi * x / (2sx))^2 * cos(pi * y / (2sy))^2 : 0.0,
            (x, y) -> (abs(x) < sx && abs(y) < sy) ?
                -w * (pi / sx) * cos(pi * x / (2sx)) * sin(pi * x / (2sx)) * cos(pi * y / (2sy))^2 : 0.0,
            (x, y) -> (abs(x) < sx && abs(y) < sy) ?
                -w * (pi / sy) * cos(pi * y / (2sy)) * sin(pi * y / (2sy)) * cos(pi * x / (2sx))^2 : 0.0,
        )
        local bowl, dwdx, dwdy
        if s["prestress_shape"] == "point"
            # Clamped circular plate, central point load: w = w0 (1 - q^2 + 2 q^2 ln q), q = r/R
            # (w(R) = 0, w'(R) = 0); dw/dr = w0 (4 r / R^2) ln q. Flat at r < r0 (the ram's tip).
            R = min(sx, sy)
            r0 = max(s["pulse_r"], 0.5dx)
            function wr(r)
                r >= R && return 0.0
                q = max(r, r0) / R
                return w0 * (1 - q^2 + 2 * q^2 * log(q))
            end
            function dwr(r)
                (r >= R || r < r0) && return 0.0
                return w0 * (4r / R^2) * log(r / R)
            end
            bowl = (x, y) -> wr(hypot(x, y))
            dwdx = (x, y) -> (r = hypot(x, y); r > 1e-9 ? dwr(r) * x / r : 0.0)
            dwdy = (x, y) -> (r = hypot(x, y); r > 1e-9 ? dwr(r) * y / r : 0.0)
        else
            bowl, dwdx, dwdy = dish(w0)
        end
        if s["prestress_bowl"] > 0
            bw, bdx, bdy = dish(s["prestress_bowl"])
            pw, pdx, pdy = bowl, dwdx, dwdy
            bowl = (x, y) -> pw(x, y) + bw(x, y)
            dwdx = (x, y) -> pdx(x, y) + bdx(x, y)
            dwdy = (x, y) -> pdy(x, y) + bdy(x, y)
        end
        # Pressed from the struck face (z = +t/2) toward -z: the far face is in tension.
        for (dim, f) in ((0x01, p -> p[1] + p[3] * dwdx(p[1], p[2])),
                         (0x02, p -> p[2] + p[3] * dwdy(p[1], p[2])),
                         (0x03, p -> p[3] - bowl(p[1], p[2])))
            push!(pane.posdep_single_dim_ics,
                  Peridynamics.PosDepSingleDimIC(f, :position, :all_points, dim))
        end
        for (dim, f) in ((0x01, p -> p[3] * dwdx(p[1], p[2])),
                         (0x02, p -> p[3] * dwdy(p[1], p[2])),
                         (0x03, p -> -bowl(p[1], p[2])))
            push!(pane.posdep_single_dim_ics,
                  Peridynamics.PosDepSingleDimIC(f, :displacement, :all_points, dim))
        end
    end

    if s["impactor"] == "none"
        vv = VelocityVerlet(time=s["time"])
        job = Job(pane, vv; path=root, freq=s["freq"], fields=(:displacement, :damage))
        bpos = zeros(3, 0)
    elseif s["impactor"] == "pulse"
        # The blow as the force the impactor's tip puts on the struck face: a
        # Hertz pressure, p(r) ~ sqrt(1 - r^2/a^2), over the contact circle on the
        # top layer of points, rising and falling as a half sine over pulse_time.
        a = s["pulse_r"]
        hx, hy = s["hit_x"], s["hit_y"]
        top = maximum(pos[3, :])
        point_set!(p -> (p[1] - hx)^2 + (p[2] - hy)^2 < a^2 && p[3] > top - 0.6dx, pane, :tip)
        idx = pane.point_sets[:tip]
        # Force density b over the set: total F = sum b V; the Hertz profile's mean is 2/3 of its peak.
        bpeak = s["pulse_peak"] / (sum(vol[idx]) * 2 / 3)
        τ = s["pulse_time"]
        forcedensity_bc!((p, t) -> t < τ ? -bpeak * sin(pi * t / τ) *
                         sqrt(max(1 - ((p[1] - hx)^2 + (p[2] - hy)^2) / a^2, 0.0)) : 0.0,
                         pane, :tip, :z)
        vv = VelocityVerlet(time=s["time"])
        job = Job(pane, vv; path=root, freq=s["freq"], fields=(:displacement, :damage))
        bpos = zeros(3, 0)
    elseif s["impactor"] == "ram"
        a = s["ram_r"]
        hx, hy = s["hit_x"], s["hit_y"]
        point_set!(p -> (p[1] - hx)^2 + (p[2] - hy)^2 < a^2, pane, :plug)
        no_failure!(pane, :plug)
        v = s["ram_speed"]
        tr = s["ram_ramp"]
        velocity_bc!(t -> -v * min(t / tr, 1.0), pane, :plug, :z)
        vv = VelocityVerlet(time=s["time"])
        job = Job(pane, vv; path=root, freq=s["freq"], fields=(:displacement, :damage))
        bpos = zeros(3, 0)
    else
        # The impactor: a steel sphere carrying the whole mass, arriving: its lowest
        # points just inside contact range of the struck face's points (no idle approach).
        r = s["hammer_r"]
        bpos, bvol = uniform_sphere(2r, dx)
        bpos[1, :] .+= s["hit_x"]
        bpos[2, :] .+= s["hit_y"]
        top = maximum(pos[3, :])
        bpos[3, :] .+= top + 0.9dx - minimum(bpos[3, :])
        hammer = Body(BBMaterial(), bpos, bvol)
        rho_h = s["hammer_mass"] / (4 / 3 * pi * r^3)
        material!(hammer; horizon=δ, rho=rho_h, E=200e9)   # no Gc: it does not break
        velocity_ic!(hammer, :all_points, :z, -s["speed"])

        ms = MultibodySetup(:pane => pane, :hammer => hammer)
        contact!(ms, :pane, :hammer; radius=dx, penalty_factor=s["penalty"])
        vv = VelocityVerlet(time=s["time"])
        fields = Dict(:pane => (:displacement, :damage), :hammer => (:displacement,))
        job = Job(ms, vv; path=root, freq=s["freq"], fields=fields)
    end

    open(joinpath(root, "settings.txt"), "w") do io
        for k in sort(collect(keys(s)))
            println(io, k, "=", s[k])
        end
        @printf(io, "points_pane=%d\npoints_hammer=%d\nweibull_w=%s\n",
                size(pos, 2), size(bpos, 2), join(round.(w; digits=4), ","))
    end
    wall = @elapsed submit(job)
    open(joinpath(root, "settings.txt"), "a") do io
        @printf(io, "wall_s=%.1f\n", wall)
    end
    @printf("done %s: %d pane points, %.1f s\n", s["name"], size(pos, 2), wall)
end

main(ARGS)
