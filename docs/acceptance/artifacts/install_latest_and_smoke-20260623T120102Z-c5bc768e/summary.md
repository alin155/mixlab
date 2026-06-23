# Windows Test Runner Run install_latest_and_smoke-20260623T120102Z-c5bc768e

- Suite: install_latest_and_smoke
- Status: passed
- Runner: 0.1.32
- Started: 2026-06-23T12:01:02.787Z
- Updated: 2026-06-23T12:01:21.928Z
- Finished: 2026-06-23T12:01:21.834Z

## Launch App Probe

- API ready before launch: false
- API ready: true
- API ready elapsed: 4585ms
- App started: true
- App executable: cmd.exe
- App PID: 35364

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

- Installer source: \\192.168.1.21\“华启航”的公共文件夹\MixLabWindowsBuilds\MixLab Cutter_0.18.10_x64-setup-8d5305d.exe
- Local installer: C:\Users\ASUS\AppData\Local\Temp\MixLabWindowsTestRunner\installers\2026-06-23T12-01-02-926Z-MixLab Cutter_0.18.10_x64-setup-8d5305d.exe
- Copied installer: true
- Expected SHA-256: 752104a5910523cfaf5c3bc6b793d546238fe1e6d7f62f65f150be7229b0a83d
- Actual SHA-256: 752104a5910523cfaf5c3bc6b793d546238fe1e6d7f62f65f150be7229b0a83d
- Install exit code: 0
- Install elapsed: 8497ms

## App Runtime Smoke

- Auth mode: reviewed
- Local trusted: false
- Runtime status: 29ms
- Available videos: 10471
- Workspace enabled: true
- FFmpeg: 可用 (环境配置)
- Source library: 20 / 10471, 3ms
- First source: V000001 1.房产置换与资产优化

## Real Data Smoke

- Source library: 20 / 10471, 25ms
- Search "第一场": 10 groups, 16 hits, 804ms
- Selected detail: V000790, transcript 27408 chars / 783 segments, 22ms
- Cut jobs: total 47, pending 0, running 0, done 43, failed 4, 8ms

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
