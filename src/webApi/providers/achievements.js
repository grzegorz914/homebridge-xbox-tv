'use strict';
const HttpClient = require('../httpclient.js');

class ACHIVEMENTS {
    constructor(client, headers) {
        this.client = client;
        this.headers = headers;
        this.httpClient = new HttpClient();
        this.headers['x-xbl-contract-version'] = '2';
    }

    getTitleAchievements(continuationToken = 0) {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://achievements.xboxlive.com/users/xuid(${this.client.authentication.user.xid})/history/titles?continuationToken=${continuationToken}`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

    getTitleAchievements360(continuationToken = 0) {
        return new Promise(async (resolve, reject) => {
            try {
                this.headers['x-xbl-contract-version'] = 1
                const url = `https://achievements.xboxlive.com/users/xuid(${this.client.authentication.user.xid})/history/titles?continuationToken=${continuationToken}`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

    getTitleId(titleId, continuationToken = 0) {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://achievements.xboxlive.com/users/xuid(${this.client.authentication.user.xid})/achievements?titleId=${titleId}&continuationToken=${continuationToken}`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

    getTitleId360(titleId, continuationToken = 0) {
        return new Promise(async (resolve, reject) => {
            try {
                this.headers['x-xbl-contract-version'] = 1
                const url = `https://achievements.xboxlive.com/users/xuid(${this.client.authentication.user.xid})/achievements?titleId=${titleId}&continuationToken=${continuationToken}`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = ACHIVEMENTS;