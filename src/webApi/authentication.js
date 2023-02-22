'use strict';
const axios = require('axios');
const QueryString = require('querystring');
const fs = require('fs');
const fsPromises = fs.promises;
const HttpClient = require('./httpclient.js');
const CONSTANS = require('../constans.json');

class AUTHENTICATION {
    constructor(config) {
        this.httpClient = new HttpClient();
        this.xboxLiveUser = config.xboxLiveUser;
        this.xboxLivePasswd = config.xboxLivePasswd;
        this.clientId = config.clientId || 'a34ac209-edab-4b08-91e7-a4558d8da1bd';
        this.clientSecret = config.clientSecret;
        this.userToken = config.userToken;
        this.userHash = config.userHash;
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

    accessToken(webApiToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const payload = {
                    "client_id": this.clientId,
                    "grant_type": 'authorization_code',
                    "scope": CONSTANS.Scopes.join(' '),
                    "code": webApiToken,
                    "redirect_uri": 'http://localhost:8888/auth/callback'
                }
                const addClientSecret = this.clientSecret ? payload.client_secret = this.clientSecret : false;

                const postData = QueryString.stringify(payload);
                const url = 'https://login.live.com/oauth20_token.srf';
                const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
                const data = await this.httpClient.post(url, headers, postData);
                const token = JSON.parse(data);
                token.issued = new Date().toISOString();
                this.tokens.oauth = token;
                await this.saveTokens(this.tokens);
                resolve();
            } catch (error) {
                reject(error);
            };
        })
    }

    refreshToken(refreshToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const payload = {
                    "client_id": this.clientId,
                    "grant_type": "refresh_token",
                    "scope": CONSTANS.Scopes.join(' '),
                    "refresh_token": refreshToken,
                }
                const addClientSecret = this.clientSecret ? payload.client_secret = this.clientSecret : false;

                const postData = QueryString.stringify(payload);
                const url = 'https://login.live.com/oauth20_token.srf';
                const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
                const data = await this.httpClient.post(url, headers, postData);
                const token = JSON.parse(data);
                token.issued = new Date().toISOString();
                resolve(token);
            } catch (error) {
                reject(error);
            };
        })
    }

    getUserToken(accessToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const payload = {
                    "RelyingParty": 'http://auth.xboxlive.com',
                    "TokenType": 'JWT',
                    "Properties": {
                        "AuthMethod": 'RPS',
                        "SiteName": 'user.auth.xboxlive.com',
                        "RpsTicket": `d=${accessToken}`
                    },
                }

                const postData = JSON.stringify(payload);
                const url = 'https://user.auth.xboxlive.com/user/authenticate';
                const headers = { 'Content-Type': 'application/json' };
                const data = await this.httpClient.post(url, headers, postData);
                const token = JSON.parse(data);
                resolve(token);
            } catch (error) {
                reject(error);
            };
        })
    }

    getXstsToken(userToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const payload = {
                    "RelyingParty": 'http://xboxlive.com',
                    "TokenType": 'JWT',
                    "Properties": {
                        "UserTokens": [userToken],
                        "SandboxId": 'RETAIL',
                    },
                }

                const postData = JSON.stringify(payload);
                const url = 'https://xsts.auth.xboxlive.com/xsts/authorize';
                const headers = { 'Content-Type': 'application/json', 'x-xbl-contract-version': '1' };
                const data = await this.httpClient.post(url, headers, postData);
                const token = JSON.parse(data);
                resolve(token);
            } catch (error) {
                reject(error);
            };
        })
    }

    checkAuthorization() {
        return new Promise(async (resolve, reject) => {
            try {
                if (fs.existsSync(this.tokensFile) && fs.readFileSync(this.tokensFile).length > 30) {
                    const tokens = fs.readFileSync(this.tokensFile).toString();
                    this.tokens = JSON.parse(tokens);
                }

                if (this.clientId) {
                    await this.refreshTokens();
                    resolve();
                } else if (this.userToken && this.userHash) {
                    resolve();
                } else {
                    reject('Not authorized, check client id in settings.');
                }
            } catch (error) {
                reject(error);
            };
        })
    }

    generateAuthorizationUrl() {
        return new Promise((resolve, reject) => {
            try {
                const payload = {
                    "client_id": this.clientId,
                    "response_type": 'code',
                    "approval_prompt": 'auto',
                    "scope": CONSTANS.Scopes.join(' '),
                    "redirect_uri": 'http://localhost:8888/auth/callback'
                }
                const params = QueryString.stringify(payload);
                const oauth2URI = `https://login.live.com/oauth20_authorize.srf?${params}`;
                resolve(oauth2URI);
            } catch (error) {
                reject(error);
            };
        })
    }

    getCode(oauth2URI) {
        return new Promise(async (resolve, reject) => {
            try {
                const payload = {
                    method: 'GET',
                    params: {
                        user: this.xboxLiveUser,
                        password: this.xboxLivePasswd
                    }
                }

                const response = await axios(oauth2URI, payload);
                const url = response.data;
                const parsedUrl = url.parse(url, true);
                const webApiToken = QueryString.parse(parsedUrl).code;
                resolve(webApiToken);
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
                await this.checkAuthorization();
                resolve();
            } catch (error) {
                reject(error);
            };
        })
    }
}
module.exports = AUTHENTICATION;