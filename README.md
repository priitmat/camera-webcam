# Camera Webcam

Use a DSLR or mirrorless camera as a webcam on Linux over a single USB cable, with a GNOME top bar indicator.

- Switch the camera on and it appears as **Camera Webcam** in Meet, Zoom, Teams, OBS and browsers.
- Switch it off and the webcam goes away. No terminal needed.
- The top bar icon shows the status and has Start / Stop / Restart / Show logs.

It streams the camera's USB live view with [gphoto2](http://www.gphoto.org/) into a [v4l2loopback](https://github.com/umlaeute/v4l2loopback) virtual webcam. A udev rule starts a systemd service whenever a supported camera is connected.

Tested with a **Canon EOS M50** on Ubuntu with GNOME 51. Most cameras that gphoto2 can stream live view from should work ([support list](http://www.gphoto.org/proj/libgphoto2/support.php), look for "Liveview").

## Install

```bash
git clone https://github.com/priitmat/camera-webcam.git
cd camera-webcam
./install.sh
```

Log out and back in, then:

```bash
gnome-extensions enable camera-webcam@priitmat.github.io
```

**Secure Boot:** v4l2loopback is built locally, so with Secure Boot on, the installer asks you to set a one-time password. On the next reboot choose **Enroll MOK** on the blue screen and enter it. Check with `mokutil --sb-state`.

## Camera settings

- Turn off Wi-Fi and Bluetooth on the camera (they block USB control on many models).
- Disable auto power off.
- Use a dummy battery / AC adapter for anything longer than a short call. Live view drains batteries fast.

## Settings

Edit `/etc/default/camera-webcam`, then `sudo systemctl restart camera-webcam`:

| Setting | Default | |
|---|---|---|
| `VIDEO_DEVICE` | `/dev/video10` | Virtual webcam device |
| `VIDEO_FILTER` | empty | ffmpeg filter, e.g. `hflip` to mirror |

## Resolution

USB live view is the camera's preview stream, typically around 1024×576 (1080p on some newer bodies). That's enough for video calls. For full 1080p, use the camera's HDMI output with a USB HDMI capture stick instead; it works as a normal webcam without this project.

## Troubleshooting

```bash
systemctl status camera-webcam     # service state
journalctl -fu camera-webcam       # live logs
gphoto2 --auto-detect              # is the camera visible?
systemctl status dev-camerawebcam.device   # did udev recognise the camera?
```

- **"Could not claim the USB device":** another program grabbed the camera. The installer masks GNOME's camera auto-mount; also close Shotwell, darktable, Rapid Photo Downloader etc.
- **Service never starts:** the camera isn't tagged by libgphoto2's udev rules (the last command above shows "inactive" with the camera on). Open an issue with your camera model.
- **Not visible in Chrome / Meet:** v4l2loopback must be loaded with `exclusive_caps=1` (the installer sets this). If you also use OBS Virtual Camera, OBS may reload the module with other options.

## Uninstall

```bash
./uninstall.sh
```

Note: the installer masks `gvfs-gphoto2-volume-monitor`, so cameras don't appear in Files for photo import. The uninstaller restores it.

## License

GPL-2.0-or-later. Not affiliated with or endorsed by Canon or any other camera maker; brand names are used only to describe compatibility.
