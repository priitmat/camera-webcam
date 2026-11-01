// SPDX-License-Identifier: GPL-2.0-or-later

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const SERVICE = 'camera-webcam.service';
// Alias device unit that the udev rule attaches to a connected camera
const DEVICE = 'dev-camerawebcam.device';

const SYSTEMD = 'org.freedesktop.systemd1';
const SYSTEMD_PATH = '/org/freedesktop/systemd1';
const MANAGER_IFACE = 'org.freedesktop.systemd1.Manager';
const UNIT_IFACE = 'org.freedesktop.systemd1.Unit';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

function systemdCall(path, iface, method, params, replyType, cancellable,
    flags = Gio.DBusCallFlags.NONE) {
    return new Promise((resolve, reject) => {
        Gio.DBus.system.call(SYSTEMD, path, iface, method, params,
            replyType ? new GLib.VariantType(replyType) : null,
            flags, -1, cancellable, (conn, res) => {
                try {
                    resolve(conn.call_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

function isCancelled(e) {
    return e instanceof GLib.Error &&
        e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

const CameraWebcamIndicator = GObject.registerClass(
class CameraWebcamIndicator extends PanelMenu.Button {
    _init(extensionPath) {
        super._init(0.0, 'Camera Webcam');

        this._cancellable = new Gio.Cancellable();
        this._subscriptions = [];
        this._unitPaths = new Map();

        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(
                `${extensionPath}/icons/camera-webcam-symbolic.svg`),
            style_class: 'system-status-icon camera-webcam-idle',
        });
        this.add_child(this._icon);

        this._statusItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this.menu.addMenuItem(this._statusItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._startItem = this.menu.addAction('Start webcam',
            () => this._unitAction('StartUnit'));
        this._stopItem = this.menu.addAction('Stop webcam',
            () => this._unitAction('StopUnit'));
        this._restartItem = this.menu.addAction('Restart webcam',
            () => this._unitAction('RestartUnit'));
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Show logs', () => this._showLogs());

        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._refresh();
        });

        this._render('unknown', false);
        this._connectSystemd().catch(e => {
            if (!isCancelled(e))
                console.error(`Camera Webcam: ${e.message}`);
        });
    }

    async _connectSystemd() {
        const bus = Gio.DBus.system;

        // Ask systemd to emit unit change signals. Harmless if already enabled.
        try {
            await systemdCall(SYSTEMD_PATH, MANAGER_IFACE, 'Subscribe',
                null, null, this._cancellable);
        } catch (e) {
            if (isCancelled(e))
                throw e;
        }

        for (const unit of [SERVICE, DEVICE]) {
            const reply = await systemdCall(SYSTEMD_PATH, MANAGER_IFACE,
                'LoadUnit', new GLib.Variant('(s)', [unit]), '(o)',
                this._cancellable);
            if (this._destroyed)
                return;

            const [path] = reply.deepUnpack();
            this._unitPaths.set(unit, path);
            this._subscriptions.push(bus.signal_subscribe(SYSTEMD,
                PROPS_IFACE, 'PropertiesChanged', path, null,
                Gio.DBusSignalFlags.NONE, () => this._refresh()));
        }

        for (const signal of ['UnitNew', 'UnitRemoved']) {
            this._subscriptions.push(bus.signal_subscribe(SYSTEMD,
                MANAGER_IFACE, signal, SYSTEMD_PATH, null,
                Gio.DBusSignalFlags.NONE,
                (_conn, _sender, _path, _iface, _signal, params) => {
                    const [name] = params.deepUnpack();
                    if (this._unitPaths.has(name))
                        this._refresh();
                }));
        }

        await this._refresh();
    }

    async _activeState(unit) {
        try {
            const reply = await systemdCall(this._unitPaths.get(unit),
                PROPS_IFACE, 'Get',
                new GLib.Variant('(ss)', [UNIT_IFACE, 'ActiveState']),
                '(v)', this._cancellable);
            return reply.recursiveUnpack()[0];
        } catch (e) {
            if (isCancelled(e))
                throw e;
            return 'inactive';
        }
    }

    async _refresh() {
        if (this._destroyed || this._unitPaths.size < 2)
            return;
        if (this._refreshing) {
            this._refreshPending = true;
            return;
        }

        this._refreshing = true;
        try {
            const service = await this._activeState(SERVICE);
            const camera = await this._activeState(DEVICE) === 'active';
            if (!this._destroyed)
                this._render(service, camera);
        } catch (e) {
            if (!isCancelled(e))
                console.error(`Camera Webcam: ${e.message}`);
        } finally {
            this._refreshing = false;
            if (this._refreshPending && !this._destroyed) {
                this._refreshPending = false;
                this._refresh();
            }
        }
    }

    _render(service, camera) {
        let label, style;
        if (service === 'active') {
            label = 'Streaming';
            style = 'active';
        } else if (service === 'activating' || service === 'reloading') {
            label = 'Starting...';
            style = 'busy';
        } else if (service === 'deactivating') {
            label = 'Stopping...';
            style = 'busy';
        } else if (camera) {
            label = service === 'failed'
                ? 'Camera connected, webcam failed'
                : 'Camera connected, not streaming';
            style = 'busy';
        } else if (service === 'unknown') {
            label = 'Checking...';
            style = 'idle';
        } else {
            label = 'No camera connected';
            style = 'idle';
        }

        this._statusItem.label.text = label;
        this._icon.style_class = `system-status-icon camera-webcam-${style}`;

        const running = ['active', 'activating', 'reloading'].includes(service);
        this._startItem.setSensitive(camera && !running);
        this._stopItem.setSensitive(running);
        this._restartItem.setSensitive(camera);
    }

    async _unitAction(method) {
        try {
            await systemdCall(SYSTEMD_PATH, MANAGER_IFACE, method,
                new GLib.Variant('(ss)', [SERVICE, 'replace']), '(o)',
                this._cancellable,
                Gio.DBusCallFlags.ALLOW_INTERACTIVE_AUTHORIZATION);
        } catch (e) {
            if (!isCancelled(e))
                Main.notifyError('Camera Webcam', e.message);
        }
    }

    _showLogs() {
        const cmd = ['journalctl', '-fu', SERVICE];
        for (const term of ['ptyxis', 'gnome-terminal', 'kgx']) {
            if (!GLib.find_program_in_path(term))
                continue;
            try {
                Gio.Subprocess.new([term, '--', ...cmd], Gio.SubprocessFlags.NONE);
            } catch (e) {
                console.error(`Camera Webcam: ${e.message}`);
            }
            return;
        }
        Main.notifyError('Camera Webcam',
            `No supported terminal found. Run: ${cmd.join(' ')}`);
    }

    destroy() {
        this._destroyed = true;
        this._cancellable.cancel();
        for (const id of this._subscriptions)
            Gio.DBus.system.signal_unsubscribe(id);
        this._subscriptions = [];
        super.destroy();
    }
});

export default class CameraWebcamExtension extends Extension {
    enable() {
        this._indicator = new CameraWebcamIndicator(this.path);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
