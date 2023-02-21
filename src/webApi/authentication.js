'use strict';
const QueryString = require('querystring');
const fs = require('fs');
const fsPromises = fs.promises;
const HttpClient = require('./httpclient.js');
const CONSTANS = require('../constans.json');

class AUTHENTICATION {
    constructor(config) {
        this.httpClient = new HttpClient();
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.userToken = config.userToken;
        this.uhs = config.uhs;
        this.tokensFile = config.tokensFile;

        this.user = {
            gtg: {},
            xid: {},
            uhs: {},
            usr: {},
            utr: {},
            prv: {},
            agg: {}
        };
        this.tokens = {
            oauth: {},
            user: {},
            xsts: {}
        };
    }

    refreshTokens(type) {
        return new Promise(async (resolve, reject) => {
            type = type || 'oauth'

            switch (type) {
                case 'oauth':
                    if (!this.tokens.oauth.refresh_token) {
                        reject('No oauth token found. Use authorization manager first.')
                        return;
                    };

                    try {
                        await this.refreshTokens('user');
                        resolve();
                    } catch (error) {
                        reject(error);
                    };
                    break;
                case 'user':
                    if (this.tokens.user.Token) {
                        try {
                            const userExpireUser = new Date(this.tokens.user.NotAfter).getTime();
                            if (new Date() > userExpireUser) {
                                const refreshToken = await this.refreshToken(this.tokens.oauth.refresh_token);
                                this.tokens.oauth = refreshToken;
                                await this.saveTokens(this.tokens);

                                const accessToken = await this.getUserToken(this.tokens.oauth.access_token);
                                this.tokens.user = accessToken;
                                this.tokens.xsts = {};
                                await this.saveTokens(this.tokens);
                                await this.refreshTokens('xsts');
                                resolve();
                            } else {
                                try {
                                    await this.refreshTokens('xsts');
                                    resolve();
                                } catch (error) {
                                    reject(error);
                                };
                            }
                        } catch (error) {
                            reject(error);
                        };
                    } else {
                        try {
                            const accessToken = await this.getUserToken(this.tokens.oauth.access_token);
                            this.tokens.user = accessToken;
                            this.tokens.xsts = {};
                            await this.saveTokens(this.tokens);
                            await this.refreshTokens('xsts');
                            resolve();
                        } catch (error) {
                            reject(error);
                        };
                    }
                    break;
                case 'xsts':
                    if (this.tokens.xsts.Token) {
                        try {
                            const oauthExpire = new Date(this.tokens.xsts.NotAfter).getTime();
                            if (new Date() > oauthExpire) {
                                this.tokens.xsts = {};
                                await this.saveTokens(this.tokens);

                                const userToken = await this.getXstsToken(this.tokens.user.Token);
                                this.tokens.xsts = userToken;
                                await this.saveTokens(this.tokens);
                                await this.refreshTokens('xsts');
                                resolve();
                            } else {
                                this.user.gtg = this.tokens.xsts.DisplayClaims.xui[0].gtg;
                                this.user.xid = this.tokens.xsts.DisplayClaims.xui[0].xid;
                                this.user.uhs = this.tokens.xsts.DisplayClaims.xui[0].uhs;
                                this.user.usr = this.tokens.xsts.DisplayClaims.xui[0].usr;
                                this.user.utr = this.tokens.xsts.DisplayClaims.xui[0].utr;
                                this.user.prv = this.tokens.xsts.DisplayClaims.xui[0].prv;
                                this.user.agg = this.tokens.xsts.DisplayClaims.xui[0].agg;
                                resolve();
                            }
                        } catch (error) {
                            reject(error);
                        };
                    } else {
                        try {
                            const userToken = await this.getXstsToken(this.tokens.user.Token);
                            this.tokens.xsts = userToken;
                            await this.saveTokens(this.tokens);

                            this.user.gtg = userToken.DisplayClaims.xui[0].gtg;
                            this.user.xid = userToken.DisplayClaims.xui[0].xid;
                            this.user.uhs = userToken.DisplayClaims.xui[0].uhs;
                            this.user.usr = userToken.DisplayClaims.xui[0].usr;
                            this.user.utr = userToken.DisplayClaims.xui[0].utr;
                            this.user.prv = userToken.DisplayClaims.xui[0].prv;
                            this.user.agg = userToken.DisplayClaims.xui[0].agg;
                            resolve();
                        } catch (error) {
                            reject(error);
                        };
                    }
                    break;
            }
        })
    }

    refreshToken(refreshToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const tokenParams = {
                    "client_id": this.clientId,
                    "grant_type": "refresh_token",
                    "scope": CONSTANS.Scopes.join(' '),
                    "refresh_token": refreshToken,
                }

                if (this.clientSecret !== '') {
                    tokenParams.client_secret = this.clientSecret;
                }

                const postData = QueryString.stringify(tokenParams);
                const url = 'https://login.live.com/oauth20_token.srf';
                const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
                const data = await this.httpClient.post(url, headers, postData);
                const responseData = JSON.parse(data);
                responseData.issued = new Date().toISOString();
                resolve(responseData);
            } catch (error) {
                reject(error);
            };
        })
    }

    getUserToken(accessToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const tokenParams = {
                    "RelyingParty": 'http://auth.xboxlive.com',
                    "TokenType": 'JWT',
                    "Properties": {
                        "AuthMethod": 'RPS',
                        "SiteName": 'user.auth.xboxlive.com',
                        "RpsTicket": `d=${accessToken}`
                    },
                }

                const postData = JSON.stringify(tokenParams);
                const url = 'https://user.auth.xboxlive.com/user/authenticate';
                const headers = { 'Content-Type': 'application/json' };
                const data = await this.httpClient.post(url, headers, postData);
                const responseData = JSON.parse(data);
                resolve(responseData);
            } catch (error) {
                reject(error);
            };
        })
    }

    getXstsToken(userToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const tokenParams = {
                    "RelyingParty": 'http://xboxlive.com',
                    "TokenType": 'JWT',
                    "Properties": {
                        "UserTokens": [userToken],
                        "SandboxId": 'RETAIL',
                    },
                }

                const postData = JSON.stringify(tokenParams);
                const url = 'https://xsts.auth.xboxlive.com/xsts/authorize';
                const headers = { 'Content-Type': 'application/json', 'x-xbl-contract-version': '1' };
                const data = await this.httpClient.post(url, headers, postData);
                const responseData = JSON.parse(data);
                resolve(responseData);
            } catch (error) {
                reject(error);
            };
        })
    }

    isAuthenticated() {
        return new Promise(async (resolve, reject) => {
            try {
                if (fs.existsSync(this.tokensFile) && fs.readFileSync(this.tokensFile).length > 30) {
                    const tokens = fs.readFileSync(this.tokensFile).toString();
                    this.tokens = JSON.parse(tokens);
                }

                if (this.clientId !== '') {
                    await this.refreshTokens();
                    resolve(true);
                } else if (this.userToken !== '' && this.uhs !== '') {
                    resolve(true);
                } else {
                    reject({ error: 'Client Id, user Token or Uhs missing!!!' });
                }
            } catch (error) {
                reject(error);
            };
        })
    }

    getTokenRequest(webApiToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const tokenParams = {
                    "client_id": this.clientId,
                    "grant_type": 'authorization_code',
                    "scope": CONSTANS.Scopes.join(' '),
                    "code": webApiToken,
                    "redirect_uri": 'http://localhost:8080/auth/callback'
                }

                if (this.clientSecret !== '') {
                    tokenParams.client_secret = this.clientSecret;
                }

                const postData = QueryString.stringify(tokenParams);
                const url = 'https://login.live.com/oauth20_token.srf';
                const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
                const data = await this.httpClient.post(url, headers, postData);
                const responseData = JSON.parse(data);
                responseData.issued = new Date().toISOString();
                this.tokens.oauth = responseData;
                await this.saveTokens(this.tokens);
                resolve();
            } catch (error) {
                reject(error);
            };
        })
    }

    generateAuthorizationUrl() {
        return new Promise((resolve, reject) => {
            try {
                const paramsObject = {
                    "client_id": this.clientId,
                    "response_type": 'code',
                    "approval_prompt": 'auto',
                    "scope": CONSTANS.Scopes.join(' '),
                    "redirect_uri": 'http://localhost:8080/auth/callback'
                }
                const params = QueryString.stringify(paramsObject);
                const oauth2URI = `https://login.live.com/oauth20_authorize.srf?${params}`;
                resolve(oauth2URI);
            } catch (error) {
                reject(error);
            };
        })
    }

    saveTokens(tokens) {
        return new Promise(async (resolve, reject) => {
            try {
                tokens = JSON.stringify(tokens);
                await fsPromises.writeFile(this.tokensFile, tokens);
                await this.isAuthenticated();
                resolve();
            } catch (error) {
                reject(error);
            };
        })
    }
}
module.exports = AUTHENTICATION;