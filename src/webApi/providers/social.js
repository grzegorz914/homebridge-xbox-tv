'use strict';
const HttpClient = require('../httpclient.js');

class SOCIAL {
    constructor(client, headers) {
        this.client = client;
        this.headers = headers;
        this.httpClient = new HttpClient();
    }

    getFriends() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://social.xboxlive.com/users/me/summary`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = SOCIAL;