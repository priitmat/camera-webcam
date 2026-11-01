#!/bin/bash
# Camera Webcam: one-time system setup plus the GNOME top bar extension.
# Safe to run again (for example after pulling updates).
set -e
cd "$(dirname "$0")"

UUID="camera-webcam@priitmat.github.io"

echo "==> Installing packages"
if command -v apt-get >/dev/null; then
  sudo apt-get update
  sudo apt-get install -y gphoto2 v4l2loopback-dkms v4l2loopback-utils ffmpeg
elif command -v dnf >/dev/null; then
  sudo dnf install -y gphoto2 v4l2loopback ffmpeg   # v4l2loopback and ffmpeg need RPM Fusion
elif command -v pacman >/dev/null; then
  sudo pacman -S --needed --noconfirm gphoto2 v4l2loopback-dkms v4l2loopback-utils ffmpeg
else
  echo "!! Unknown package manager. Install gphoto2, v4l2loopback and ffmpeg yourself, then rerun."
  exit 1
fi

echo "==> Removing the earlier Canon M50 setup, if present"
if [ -e /etc/systemd/system/m50-webcam.service ]; then
  sudo systemctl stop m50-webcam.service 2>/dev/null || true
  sudo rm -f /etc/systemd/system/m50-webcam.service \
             /usr/local/bin/m50-webcam \
             /etc/udev/rules.d/90-m50-webcam.rules \
             /etc/polkit-1/rules.d/50-m50-webcam.rules
fi
grep -qs "Canon M50" /etc/modprobe.d/v4l2loopback.conf && sudo rm -f /etc/modprobe.d/v4l2loopback.conf
grep -qsx "v4l2loopback" /etc/modules-load.d/v4l2loopback.conf && sudo rm -f /etc/modules-load.d/v4l2loopback.conf
if command -v gnome-extensions >/dev/null && gnome-extensions info m50-webcam@priit >/dev/null 2>&1; then
  gnome-extensions uninstall m50-webcam@priit || true
fi

echo "==> Installing system files"
echo "v4l2loopback" | sudo tee /etc/modules-load.d/camera-webcam.conf >/dev/null
sudo install -m 644 setup/modprobe.conf          /etc/modprobe.d/camera-webcam.conf
sudo install -m 755 setup/camera-webcam          /usr/local/bin/camera-webcam
sudo install -m 644 setup/camera-webcam.service  /etc/systemd/system/camera-webcam.service
sudo install -m 644 setup/90-camera-webcam.rules /etc/udev/rules.d/90-camera-webcam.rules
sudo install -m 644 setup/50-camera-webcam.rules /etc/polkit-1/rules.d/50-camera-webcam.rules
if [ ! -e /etc/default/camera-webcam ]; then
  sudo install -m 644 setup/camera-webcam.default /etc/default/camera-webcam
fi

echo "==> Stopping GNOME from mounting the camera as storage"
systemctl --user mask --now gvfs-gphoto2-volume-monitor.service 2>/dev/null || true

echo "==> Applying"
sudo systemctl daemon-reload
sudo udevadm control --reload-rules
sudo modprobe -r v4l2loopback 2>/dev/null || true   # pick up the new label if not in use
if ! sudo modprobe v4l2loopback; then
  echo
  echo "!! v4l2loopback did not load. If Secure Boot is on, reboot and enroll the"
  echo "!! MOK key when the blue screen asks (use the password you set during install)."
fi

if command -v gnome-extensions >/dev/null; then
  echo "==> Installing top bar extension"
  mkdir -p build
  gnome-extensions pack extension --force --extra-source=icons --out-dir build
  gnome-extensions install --force "build/$UUID.shell-extension.zip"
  echo
  echo "Done. Log out and back in, then run:"
  echo "  gnome-extensions enable $UUID"
else
  echo
  echo "Done. GNOME not detected, so the top bar extension was skipped."
fi
echo "Then switch the camera on. It appears as \"Camera Webcam\" in your apps."
