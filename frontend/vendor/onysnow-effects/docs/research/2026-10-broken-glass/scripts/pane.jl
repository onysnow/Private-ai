# Feasibility test: "hammer" (0.5 kg steel sphere, 6 m/s) on a framed 100 x 100 x 4 mm soda-lime-like pane
using Peridynamics, Random
Random.seed!(11)
dx = 0.0008
pos, vol = uniform_box(0.100, 0.100, 0.004, dx)
pos .+= (rand(size(pos)...) .- 0.5) .* (0.3dx)          # break lattice symmetry
pane = Body(BBMaterial(), pos, vol)
material!(pane; horizon=3.015dx, rho=2500.0, E=72e9, Gc=8.0)
# frame rebate: outer 5 mm on all sides held in z (glazing bead), and not allowed to fail
point_set!(p -> abs(p[1]) > 0.045 || abs(p[2]) > 0.045, pane, :frame)
velocity_bc!(t -> 0.0, pane, :frame, :z)
no_failure!(pane, :frame)
r = 0.008
bpos, bvol = uniform_sphere(2r, dx)
bpos[3, :] .+= 0.002 + r + 0.0004
bpos[1, :] .+= 0.007; bpos[2, :] .-= 0.004
hammer = Body(BBMaterial(), bpos, bvol)
mass = 0.5; rho_h = mass / (4/3*pi*r^3)
material!(hammer; horizon=3.015dx, rho=rho_h, E=200e9)
velocity_ic!(hammer, :all_points, :z, -6.0)
ms = MultibodySetup(:pane => pane, :hammer => hammer)
contact!(ms, :pane, :hammer; radius=dx)
vv = VelocityVerlet(time=400e-6)
job = Job(ms, vv; path="pane_out", freq=250)
t = @elapsed submit(job)
println("points pane=", size(pos, 2), " hammer=", size(bpos, 2), " rho_h=", round(rho_h), " wall s=", round(t, digits=1))
