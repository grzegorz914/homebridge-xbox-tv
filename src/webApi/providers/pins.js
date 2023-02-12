'use strict';
const HttpClient = require('../httpclient.js');

class PINS {
    constructor(client, headers) {
        this.client = client;
        this.headers = headers;
        this.httpClient = new HttpClient();
        this.headers['Content-Type'] = 'application/json';
    }

    getPins(list = 'XBLPins') {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://eplists.xboxlive.com/users/xuid(${this.client.authentication.user.xid})/lists/PINS/${list}`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

    getSaveForLater() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://eplists.xboxlive.com/users/xuid(${this.client.authentication.user.xid})/lists/PINS/SaveForLater`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = PINS;