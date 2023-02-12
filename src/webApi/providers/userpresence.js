'use strict';
const HttpClient = require('../httpclient.js');

class USERPRESENCE {
    constructor(client, headers) {
        this.client = client;
        this.headers = headers;
        this.httpClient = new HttpClient();
        this.headers['x-xbl-contract-version'] = 3
    }

    getCurrentUser() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://userpresence.xboxlive.com/users/me?level=all`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = USERPRESENCE;