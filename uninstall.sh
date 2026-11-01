#!/bin/bash
# Removes everything install.sh added. Packages (gphoto2, ffmpeg, v4l2loopback) are left installed.
set -e

UUID="camera-webcam@priitmat.github.io"

sudo systemctl stop camera-webcam.service 2>/dev/null || true
sudo rm -f /etc/systemd/system/camera-webcam.service \
           /usr/local/bin/camera-webcam \
           /etc/udev/rules.d/90-camera-webcam.rules \
           /etc/polkit-1/rules.d/50-camera-webcam.rules \
           /etc/modprobe.d/camera-webcam.conf \
           /etc/modules-load.d/camera-webcam.conf \
           /etc/default/camera-webcam
sudo systemctl daemon-reload
sudo udevadm control --reload-rules
sudo modprobe -r v4l2loopback 2>/dev/null || true

systemctl --user unmask gvfs-gphoto2-volume-monitor.service 2>/dev/null || true

if command -v gnome-extensions >/dev/null; then
  gnome-extensions uninstall "$UUID" 2>/dev/null || true
fi

echo "Removed. Log out and back in to clear the top bar icon."
