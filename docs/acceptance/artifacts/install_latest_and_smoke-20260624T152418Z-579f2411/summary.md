# Windows Test Runner Run install_latest_and_smoke-20260624T152418Z-579f2411

- Suite: install_latest_and_smoke
- Status: passed
- Runner: 0.1.32
- Started: 2026-06-24T15:24:18.700Z
- Updated: 2026-06-24T15:24:36.359Z
- Finished: 2026-06-24T15:24:36.282Z

## Launch App Probe

- API ready before launch: false
- API ready: true
- API ready elapsed: 4564ms
- App started: true
- App executable: cmd.exe
- App PID: 25856

### App Candidates

- missing: C:\Users\ASUS\AppData\Local\Programs\MixLab Cutter\MixLab Cutter.exe
- missing: C:\Users\ASUS\AppData\Local\Programs\mixlab-cutter\MixLab Cutter.exe
- missing: C:\Users\ASUS\AppData\Local\Programs\com.mixlab.cutter\MixLab Cutter.exe
- missing: C:\Users\ASUS\AppData\Local\MixLab Cutter\MixLab Cutter.exe
- missing: C:\Users\ASUS\AppData\Local\mixlab-cutter\MixLab Cutter.exe
- missing: C:\Program Files\MixLab Cutter\MixLab Cutter.exe
- missing: C:\Program Files\mixlab-cutter\MixLab Cutter.exe
- missing: C:\Program Files (x86)\MixLab Cutter\MixLab Cutter.exe
- missing: C:\Program Files (x86)\mixlab-cutter\MixLab Cutter.exe
- found: C:\Users\ASUS\Desktop\MixLab Cutter.lnk

## Install Latest And Smoke

- Installer source: \\192.168.1.21\“华启航”的公共文件夹\MixLabWindowsBuilds\MixLab Cutter_0.18.10_x64-setup-3f30c9c.exe
- Local installer: C:\Users\ASUS\AppData\Local\Temp\MixLabWindowsTestRunner\installers\2026-06-24T15-24-18-846Z-MixLab Cutter_0.18.10_x64-setup-3f30c9c.exe
- Copied installer: true
- Expected SHA-256: 04e263a3cac6a443b8a655de30ce65d82b76e06807af8858e74281b079bdd0db
- Actual SHA-256: 04e263a3cac6a443b8a655de30ce65d82b76e06807af8858e74281b079bdd0db
- Install exit code: 0
- Install elapsed: 7470ms

## App Runtime Smoke

- Auth mode: reviewed
- Local trusted: false
- Runtime status: 21ms
- Available videos: 10471
- Workspace enabled: true
- FFmpeg: 可用 (环境配置)
- Source library: 20 / 10471, 2ms
- First source: V000001 1.房产置换与资产优化

## Real Data Smoke

- Source library: 20 / 10471, 14ms
- Search "第一场": 10 groups, 16 hits, 662ms
- Selected detail: V000790, transcript 27408 chars / 783 segments, 1317ms
- Cut jobs: total 49, pending 0, running 0, done 45, failed 4, 8ms

## Cache Smoke

- Observed buckets: 4
- Total observed cache size: 0 bytes
- Release cache: 0 bytes @ C:\Users\ASUS\Videos\MixLabLocal\cache
- Thumbnail cache: 0 bytes @ C:\Users\ASUS\Videos\MixLabLocal\cache\source-thumbnails
- Source video cache: 0 bytes @ C:\Users\ASUS\Videos\MixLabLocal\cache\source-videos
- Cut temp cache: 0 bytes @ C:\Users\ASUS\Videos\MixLabLocal\cache\cut-temp

## Windows Acceptance

- API base URL: http://127.0.0.1:3789
- App runtime: included
- Real data: included
- Cache: included
