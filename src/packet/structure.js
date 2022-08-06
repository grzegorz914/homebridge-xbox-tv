"use strict";

class STRUCTURE {
    constructor(packet) {
        this.packet = (packet == undefined) ? Buffer.from('') : packet;
        this.offset = 0;
    };

    writeSGString(data) {
        const bufferLength = Buffer.allocUnsafe(2);
        const dataLength = data.length;
        bufferLength.writeUInt16BE(dataLength, 0);
        const buffer = Buffer.from(data + '\x00');
        this.add(Buffer.concat([
            bufferLength,
            buffer
        ]));
        return this;
    };

    readSGString() {
        const dataLength = this.readUInt16();
        const data = this.packet.slice(this.offset, this.offset + dataLength);
        this.offset = this.offset + 1 + dataLength;
        return data;
    };

    writeBytes(data, type) {
        const buffer = Buffer.from(data, type);
        this.add(buffer);
        return this;
    };

    readBytes(count = false) {
        let data = '';

        if (count == false) {
            const totalLength = this.packet.length;
            data = this.packet.slice(this.offset);
            this.offset = totalLength;
        } else {
            data = this.packet.slice(this.offset, this.offset + count);
            this.offset = this.offset + count;
        };
        return data;
    };

    writeUInt8(data) {
        const buffer = Buffer.allocUnsafe(1);
        buffer.writeUInt8(data, 0);
        this.add(buffer);
        return this;
    };

    readUInt8() {
        const data = this.packet.readUInt8BE(this.offset);
        this.offset = this.offset + 1;
        return data;
    };

    writeUInt16(data) {
        const buffer = Buffer.allocUnsafe(2);
        buffer.writeUInt16BE(data, 0);
        this.add(buffer);
        return this;
    };

    readUInt16() {
        const data = this.packet.readUInt16BE(this.offset);
        this.offset = this.offset + 2;
        return data;
    };

    writeUInt32(data) {
        const buffer = Buffer.allocUnsafe(4);
        buffer.writeUInt32BE(data, 0);
        this.add(buffer);
        return this;
    };

    readUInt32() {
        const data = this.packet.readUInt32BE(this.offset);
        this.offset = this.offset + 4;
        return data;
    };

    writeInt32(data) {
        const buffer = Buffer.allocUnsafe(4);
        buffer.writeInt32BE(data, 0);
        this.add(buffer);
        return this;
    };

    readInt32() {
        const data = this.packet.readInt32BE(this.offset);
        this.offset = this.offset + 4;
        return data;
    };

    readUInt64() {
        const data = this.readBytes(8);
        return data;
    };

    toBuffer() {
        return this.packet;
    };

    add(data) {
        const packet = Buffer.concat([
            this.packet,
            data
        ]);
        this.packet = packet;
    };
};
module.exports = STRUCTURE;