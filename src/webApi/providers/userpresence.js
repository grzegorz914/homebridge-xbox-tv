'use strict';
const HttpClient = require('../httpclient.js');

class USERPRESENCE {
    constructor(authorizationHeaders) {
        this.headers = authorizationHeaders;
        this.headers['x-xbl-contract-version'] = '3';
        this.httpClient = new HttpClient();
    }

    getCurrentUser() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://userpresence.xboxlive.com/users/me?level=all`;
                const response = await this.httpClient.request('GET', url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = USERPRESENCE;