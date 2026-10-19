# Timing/feature test: rigid-ish steel sphere hits a 74 mm x 2.5 mm soda-lime-like disk (cf. LAMMPS howto)
using Peridynamics, Random
Random.seed!(7)
dx = 0.0005
pos, vol = uniform_box(0.074, 0.074, 0.0025, dx)
keep = [i for i in axes(pos, 2) if pos[1, i]^2 + pos[2, i]^2 <= 0.037^2]
pos = pos[:, keep]; vol = vol[keep]
# jitter points by +-15% dx to break lattice symmetry (Peridynamics.jl accepts any point cloud)
pos .+= (rand(size(pos)...) .- 0.5) .* (0.3dx)
plate = Body(BBMaterial(), pos, vol)
material!(plate; horizon=3.015dx, rho=2500.0, E=72e9, Gc=8.0)
bpos, bvol = uniform_sphere(0.010, dx)
bpos[3, :] .+= 0.00125 + 0.005 + 0.0006
bpos[1, :] .+= 0.0031; bpos[2, :] .-= 0.0008      # off-centre, like Wang et al. 2024
ball = Body(BBMaterial(), bpos, bvol)
material!(ball; horizon=3.015dx, rho=7850.0, E=200e9)  # no Gc -> no failure
velocity_ic!(ball, :all_points, :z, -100.0)
ms = MultibodySetup(:plate => plate, :ball => ball)
contact!(ms, :plate, :ball; radius=dx)
vv = VelocityVerlet(time=60e-6)
job = Job(ms, vv; path="out", freq=100)
t = @elapsed submit(job)
println("points plate=", size(pos, 2), " ball=", size(bpos, 2), " wall s=", round(t, digits=1))
