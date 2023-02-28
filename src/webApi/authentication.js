'use strict';
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
        this.clientId = config.clientId || CONSTANS.ClientId;
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
                    "scope": CONSTANS.Scopes,
                    "code": webApiToken,
                    "redirect_uri": CONSTANS.RedirectUri
                }
                const addClientSecret = this.clientSecret ? payload.client_secret = this.clientSecret : false;

                const postData = QueryString.stringify(payload);
                const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
                const data = await this.httpClient.post(CONSTANS.AccessTokenUrl, headers, postData);
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
                    "scope": CONSTANS.Scopes,
                    "refresh_token": refreshToken,
                }
                const addClientSecret = this.clientSecret ? payload.client_secret = this.clientSecret : false;

                const postData = QueryString.stringify(payload);
                const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
                const data = await this.httpClient.post(CONSTANS.RefreshTokenUrl, headers, postData);
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
                const headers = { 'Content-Type': 'application/json' };
                const data = await this.httpClient.post(CONSTANS.UserTokenUrl, headers, postData);
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
                const headers = { 'Content-Type': 'application/json', 'x-xbl-contract-version': '1' };
                const data = await this.httpClient.post(CONSTANS.XtsxTokenUrl, headers, postData);
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
        return new Promise(async (resolve, reject) => {
            try {
                const payload = {
                    "client_id": this.clientId,
                    "response_type": 'code',
                    "approval_prompt": 'auto',
                    "scope": CONSTANS.Scopes,
                    "redirect_uri": CONSTANS.RedirectUri
                }
                const params = QueryString.stringify(payload);
                const oauth2URI = `${CONSTANS.oauth2URI}${params}`;
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
                await this.checkAuthorization();
                resolve();
            } catch (error) {
                reject(error);
            };
        })
    }

    clearToken() {
        return new Promise(async (resolve, reject) => {
            try {
                if (!fs.existsSync(this.tokensFile)) {
                    const object = JSON.stringify({});
                    fs.writeFileSync(this.authTokenFile, object);

                    reject('Token file not exist, empty file created now please start authorization again.');
                    return;
                };

                await fsPromises.writeFile(this.tokensFile, JSON.stringify({}));
                resolve();
            } catch (error) {
                reject(error);
            };
        })
    }
}
module.exports = AUTHENTICATION;