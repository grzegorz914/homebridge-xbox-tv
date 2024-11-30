"use strict";

class Structure {
    constructor(packet) {
        packet = packet === undefined ? Buffer.from('') : packet;
        this.packet = packet;
        this.totalLength = packet.length;
        this.offset = 0;

        return this;
    };

    writeSGString(data) {
        if (typeof data !== 'string') {
            throw new Error('data must be a string');
        }

        const dataLength = data.length;
        if (dataLength > 65535) {
            throw new Error('data exceeds the maximum allowed length');
        }

        const stringLengthBuffer = Buffer.allocUnsafe(2);
        stringLengthBuffer.writeUInt16BE(dataLength, 0);
        const dataBuffer = Buffer.from(data + '\x00');
        this.add(Buffer.concat([stringLengthBuffer, dataBuffer]));
        return this;
    };

    readSGString() {
        const stringLength = this.readUInt16();
        const stringBuffer = this.packet.slice(this.offset, this.offset + stringLength);
        this.offset += stringLength + 1;
        return stringBuffer;
    };

    writeBytes(data, type) {
        const dataBuffer = Buffer.from(data, type);
        this.add(dataBuffer);
        return this;
    };

    readBytes(length = false) {
        let rawData = '';
        switch (length) {
            case false:
                rawData = this.packet.slice(this.offset);
                this.offset = this.totalLength;
                break;
            default:
                rawData = this.packet.slice(this.offset, this.offset + length);
                this.offset += length;
                break
        }
        return rawData;
    };

    writeUInt8(data) {
        if (data < 0 || data > 255) {
            throw new Error('data must be a valid unsigned 8-bit integer');
        }

        const uint8Buffer = Buffer.allocUnsafe(1);
        uint8Buffer.writeUInt8(data, 0);
        this.add(uint8Buffer);
        return this;
    };

    readUInt8() {
        const uint8 = this.packet.readUInt8BE(this.offset);
        this.offset += 1;
        return uint8;
    };

    writeUInt16(data) {
        if (data < 0 || data > 65535) {
            throw new Error('data must be a valid unsigned 16-bit integer');
        }

        const uint16Buffer = Buffer.allocUnsafe(2);
        uint16Buffer.writeUInt16BE(data, 0);
        this.add(uint16Buffer);
        return this;
    };

    readUInt16() {
        const uint16 = this.packet.readUInt16BE(this.offset);
        this.offset += 2;
        return uint16;
    };

    writeUInt32(data) {
        if (data < 0 || data > 4294967295) {
            throw new Error('data must be a valid unsigned 32-bit integer');
        }

        const uint32Buffer = Buffer.allocUnsafe(4);
        uint32Buffer.writeUInt32BE(data, 0);
        this.add(uint32Buffer);
        return this;
    };

    readUInt32() {
        const uint32 = this.packet.readUInt32BE(this.offset);
        this.offset += 4;
        return uint32;
    };

    writeInt32(data) {
        if (data < -2147483648 || data > 2147483647) {
            throw new Error('data must be a valid signed 32-bit integer');
        }
        const int32Buffer = Buffer.allocUnsafe(4);
        int32Buffer.writeInt32BE(data, 0);
        this.add(int32Buffer);
        return this;
    };

    readInt32() {
        const int32 = this.packet.readInt32BE(this.offset);
        this.offset += 4;
        return int32;
    };

    readUInt64() {
        const data = this.readBytes(8);
        return data;
    };

    toBuffer() {
        return this.packet;
    };

    add(data) {
        if (!Buffer.isBuffer(data)) {
            throw new Error('Data must be a Buffer object');
        }

        this.packet = Buffer.concat([this.packet, data]);
    };
};
export default Structure;