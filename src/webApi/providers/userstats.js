const HttpClient = require('../httpclient.js');

'use strict';
class USERSTATS {
    constructor(client, headers) {
        this.client = client;
        this.headers = headers;
        this.httpClient = new HttpClient();
        this.headers['x-xbl-contract-version'] = '2';
    }

    getUserTitleStats(titleId) {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://userstats.xboxlive.com/batch`;
                const params = `{"arrangebyfield":"xuid","xuids":["${this.client.authentication.user.xid}"],"groups":[{"name":"Hero","titleId":"${titleId}"}],"stats":[{"name":"MinutesPlayed","titleId":"${titleId}"}]}`;
                const response = await this.httpClient.post(url, this.headers, params);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = USERSTATS;
