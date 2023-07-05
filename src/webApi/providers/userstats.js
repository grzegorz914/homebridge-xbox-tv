const HttpClient = require('../httpclient.js');

'use strict';
class USERSTATS {
    constructor(tokens, authorizationHeaders) {
        this.tokens = tokens;
        this.headers = authorizationHeaders;
        this.headers['x-xbl-contract-version'] = '2';
        this.httpClient = new HttpClient();
    }

    getUserTitleStats(titleId) {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://userstats.xboxlive.com/batch`;
                const params = `{"arrangebyfield":"xuid","xuids":["${this.tokens.xsts.DisplayClaims.xui[0].xid}"],"groups":[{"name":"Hero","titleId":"${titleId}"}],"stats":[{"name":"MinutesPlayed","titleId":"${titleId}"}]}`;
                const response = await this.httpClient.post(url, this.headers, params);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = USERSTATS;
