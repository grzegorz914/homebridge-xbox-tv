'use strict';
const HttpClient = require('../httpclient.js');

class PINS {
    constructor(tokens, authorizationHeaders) {
        this.tokens = tokens;
        this.headers = authorizationHeaders;
        this.headers['Content-Type'] = 'application/json';
        this.httpClient = new HttpClient();
    }

    getPins(list = 'XBLPins') {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://eplists.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/lists/PINS/${list}`;
                const response = await this.httpClient.request(url, this.headers, undefined, 'GET');
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

    getSaveForLater() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://eplists.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/lists/PINS/SaveForLater`;
                const response = await this.httpClient.request(url, this.headers, undefined, 'GET');
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = PINS;