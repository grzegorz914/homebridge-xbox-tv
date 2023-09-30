'use strict';
const axios = require('axios');

class ACHIVEMENTS {
    constructor(tokens, authorizationHeaders) {
        this.tokens = tokens;
        const headers = authorizationHeaders;
        headers['x-xbl-contract-version'] = '2';

        //create axios instance
        this.axiosInstance = axios.create({
            method: 'GET',
            headers: headers
        });
    }

    getTitleAchievements(continuationToken = 0) {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://achievements.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/history/titles?continuationToken=${continuationToken}`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

    getTitleAchievements360(continuationToken = 0) {
        return new Promise(async (resolve, reject) => {
            try {
                this.headers['x-xbl-contract-version'] = 1
                const url = `https://achievements.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/history/titles?continuationToken=${continuationToken}`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

    getTitleId(titleId, continuationToken = 0) {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://achievements.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/achievements?titleId=${titleId}&continuationToken=${continuationToken}`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

    getTitleId360(titleId, continuationToken = 0) {
        return new Promise(async (resolve, reject) => {
            try {
                this.headers['x-xbl-contract-version'] = 1
                const url = `https://achievements.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/achievements?titleId=${titleId}&continuationToken=${continuationToken}`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = ACHIVEMENTS;