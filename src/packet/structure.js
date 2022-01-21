class STRUCTURE {
    constructor(packet) {
        this.packet = (packet == undefined) ? Buffer.from('') : packet;
        this.offset = 0;
    };

    writeSGString(data) {
        const lengthBuffer = Buffer.allocUnsafe(2);
        lengthBuffer.writeUInt16BE(data.length, 0);

        const dataBuffer = Buffer.from(data + '\x00');
        this.add(Buffer.concat([
            lengthBuffer,
            dataBuffer
        ]));
        return this;
    };

    readSGString() {
        const dataLength = this.readUInt16();
        const data = this.packet.slice(this.offset, this.offset + dataLength);
        this.offset = (this.offset + 1 + dataLength);
        return data;
    };

    writeBytes(data, type) {
        const dataBuffer = Buffer.from(data, type);
        this.add(dataBuffer);
        return this;
    };

    readBytes(count = false) {
        let data = '';

        if (count == false) {
            data = this.packet.slice(this.offset);
            this.offset = this.packet.length;;
        } else {
            data = this.packet.slice(this.offset, this.offset + count);
            this.offset = (this.offset + count);
        };
        return data;
    };

    writeUInt8(data) {
        const tempBuffer = Buffer.allocUnsafe(1);
        tempBuffer.writeUInt8(data, 0);
        this.add(tempBuffer);
        return this;
    };

    readUInt8() {
        const data = this.packet.readUInt8(this.offset);
        this.offset = (this.offset + 1);
        return data;
    };

    writeUInt16(data) {
        const tempBuffer = Buffer.allocUnsafe(2);
        tempBuffer.writeUInt16BE(data, 0);
        this.add(tempBuffer);
        return this;
    };

    readUInt16() {
        const data = this.packet.readUInt16BE(this.offset);
        this.offset = (this.offset + 2);
        return data;
    };

    writeUInt32(data) {
        const tempBuffer = Buffer.allocUnsafe(4);
        tempBuffer.writeUInt32BE(data, 0);
        this.add(tempBuffer);
        return this;
    };

    readUInt32() {
        const data = this.packet.readUInt32BE(this.offset);
        this.offset = (this.offset + 4);
        return data;
    };

    writeInt32(data) {
        const tempBuffer = Buffer.allocUnsafe(4);
        tempBuffer.writeInt32BE(data, 0);
        this.add(tempBuffer);
        return this;
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