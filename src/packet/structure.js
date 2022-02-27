class STRUCTURE {
    constructor(packet) {
        this.packet = (packet == undefined) ? Buffer.from('') : packet;
        this.totalLength = this.packet.length;
        this.offset = 0;
    };

    setOffset(offset) {
        this.offset = offset;
    };

    writeSGString(data) {
        const bufferLength = Buffer.allocUnsafe(2);
        bufferLength.writeUInt16BE(data.length, 0);
        const buffer = Buffer.from(data + '\x00');
        const packet = this.add(Buffer.concat([
            bufferLength,
            buffer
        ]));
        return packet;
    };

    readSGString() {
        const dataLength = this.readUInt16();
        const data = this.packet.slice(this.offset, this.offset + dataLength);
        this.offset = (this.offset + 1 + dataLength);
        return data;
    };

    writeBytes(data, type) {
        const buffer = Buffer.from(data, type);
        const packet = this.add(buffer);
        return packet;
    };

    readBytes(count = false) {
        let data = '';

        if (count == false) {
            data = this.packet.slice(this.offset);
            this.offset = this.totalLength;
        } else {
            data = this.packet.slice(this.offset, this.offset + count);
            this.offset = (this.offset + count);
        };
        return data;
    };

    writeUInt8(data) {
        const buffer = Buffer.allocUnsafe(1);
        buffer.writeUInt8(data, 0);
        const packet = this.add(buffer);
        return packet;
    };

    readUInt8() {
        const data = this.packet.readUInt8(this.offset);
        this.offset = (this.offset + 1);
        return data;
    };

    writeUInt16(data) {
        const buffer = Buffer.allocUnsafe(2);
        buffer.writeUInt16BE(data, 0);
        const packet = this.add(buffer);
        return packet;
    };

    readUInt16() {
        const data = this.packet.readUInt16BE(this.offset);
        this.offset = (this.offset + 2);
        return data;
    };

    writeUInt32(data) {
        const buffer = Buffer.allocUnsafe(4);
        buffer.writeUInt32BE(data, 0);
        const packet = this.add(buffer);
        return packet;
    };

    readUInt32() {
        const data = this.packet.readUInt32BE(this.offset);
        this.offset = (this.offset + 4);
        return data;
    };

    writeInt32(data) {
        const buffer = Buffer.allocUnsafe(4);
        buffer.writeInt32BE(data, 0);
        const packet = this.add(buffer);
        return packet;
    };

    readInt32() {
        const data = this.packet.readInt32BE(this.offset);
        this.offset = (this.offset + 4);
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
        this.packet = Buffer.concat([
            this.packet,
            data
        ]);
    };
};
module.exports = STRUCTURE;