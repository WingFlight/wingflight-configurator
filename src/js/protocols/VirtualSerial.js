export function connectVirtual(self, callback) {
    self.connectionType = 'virtual';

    if (!self.openCanceled) {
        self.connected = true;
        self.connectionId = 'virtual';
        self.bitrate = 115200;
        self.bytesReceived = 0;
        self.bytesSent = 0;
        self.failed = 0;

        callback?.();
    }
}
