'use strict';
const HttpClient = require('../httpclient.js');

class TITLEHUB {
    constructor(client, headers) {
        this.client = client;
        this.headers = headers;
        this.httpClient = new HttpClient();
    }

    getTitleHistory() {
        return new Promise(async (resolve, reject) => {
            try {
                const params = [
                    'achievement',
                    'image',
                    'scid',
                ]

                const url = `https://titlehub.xboxlive.com/users/xuid(${this.client.authentication.user.xid})/titles/titlehistory/decoration/${params.join(',')}`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

    getTitleId(titleId) {
        return new Promise(async (resolve, reject) => {
            try {
                const params = [
                    'achievement',
                    'image',
                    'detail',
                    'scid',
                    'alternateTitleId'
                ]

                const url = `https://titlehub.xboxlive.com/users/xuid(${this.client.authentication.user.xid})/titles/titleid(${titleId})/decoration/${params.join(',')}`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = TITLEHUB;