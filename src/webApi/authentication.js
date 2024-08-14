'use strict';
const QueryString = require('querystring');
const fs = require('fs');
const fsPromises = fs.promises;
const axios = require('axios');
const EventEmitter = require('events');
const CONSTANTS = require('../constants.json');

class Authentication extends EventEmitter{
    constructor(config) {
        super();
        this.webApiClientId = config.webApiClientId || CONSTANTS.WebApi.ClientId;
        this.webApiClientSecret = config.webApiClientSecret;
        this.tokensFile = config.tokensFile;
        this.tokens = {
            oauth: {},
            user: {},
            xsts: {}
        };
    }

    async refreshTokens(type) {
        switch (type) {
            case 'user':
                if (this.tokens.user.Token) {
                    const tokenExpired = new Date() > new Date(this.tokens.user.NotAfter).getTime();
                    switch (tokenExpired) {
                        case true:
                            try {
                                await this.refreshToken(this.tokens.oauth.refresh_token);
                                await this.getUserToken(this.tokens.oauth.access_token);
                                await this.refreshTokens('xsts');
                                return true;
                            } catch (error) {
                                this.emit('error', error);
                            };
                            break;
                        case false:
                            try {
                                await this.refreshTokens('xsts');
                                return true;
                            } catch (error) {
                                this.emit('error', error);
                            };
                            break;
                    }
                } else {
                    try {
                        await this.getUserToken(this.tokens.oauth.access_token);
                        await this.refreshTokens('xsts');
                        return true;
                    } catch (error) {
                        this.emit('error', error);
                    };
                }
                break;
            case 'xsts':
                if (this.tokens.xsts.Token) {
                    const tokenExpired = new Date() > new Date(this.tokens.xsts.NotAfter).getTime();
                    switch (tokenExpired) {
                        case true:
                            try {
                                await this.getXstsToken(this.tokens.user.Token);
                                await this.refreshTokens('xsts');
                                return true;
                            } catch (error) {
                                this.emit('error', error);
                            };
                            break;
                        case false:
                            return true;
                            break;
                    }
                } else {
                    try {
                        await this.getXstsToken(this.tokens.user.Token);
                        return true;
                    } catch (error) {
                        this.emit('error', error);
                    };
                }
                break;
            default:
                this.emit('error', `Unknow refresh token type: ${type}.`);
                break;
        }
    }

    async refreshToken(token) {
        try {
            const payload = {
                "client_id": this.webApiClientId,
                "grant_type": "refresh_token",
                "scope": CONSTANTS.WebApi.Scopes,
                "refresh_token": token,
            }
            const addClientSecret = this.webApiClientSecret ? payload.client_secret = this.webApiClientSecret : false;

            const postData = QueryString.stringify(payload);
            const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
            const response = await axios.post(CONSTANTS.WebApi.Url.RefreshToken, postData, headers);
            const refreshToken = response.data;
            refreshToken.issued = new Date().toISOString();
            this.tokens.oauth = refreshToken;
            return true;
        } catch (error) {
            this.emit('error', error);
        };
    }

    async getUserToken(accessToken) {
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
            const response = await axios.post(CONSTANTS.WebApi.Url.UserToken, postData, { headers });
            const userToken = response.data;
            this.tokens.user = userToken;
            this.tokens.xsts = {};
            return true;
        } catch (error) {
            this.emit('error', error);
        };
    }

    async getXstsToken(userToken) {
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
            const response = await axios.post(CONSTANTS.WebApi.Url.XstsToken, postData, headers);
            const xstsToken = response.data;
            this.tokens.xsts = xstsToken;
            return true;
        } catch (error) {
            this.emit('error', error);
        };
    }

    async accessToken(webApiToken) {
        try {
            const payload = {
                "client_id": this.webApiClientId,
                "grant_type": 'authorization_code',
                "scope": CONSTANTS.WebApi.Scopes,
                "code": webApiToken,
                "redirect_uri": CONSTANTS.WebApi.Url.Redirect
            }
            const addClientSecret = this.webApiClientSecret ? payload.client_secret = this.webApiClientSecret : false;

            const postData = QueryString.stringify(payload);
            const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
            const response = await axios.post(CONSTANTS.WebApi.Url.AccessToken, postData, headers);
            const accessToken = response.data;
            accessToken.issued = new Date().toISOString();
            this.tokens.oauth = accessToken;
            await this.saveTokens(this.tokens);
            return true;
        } catch (error) {
            this.emit('error', error);
        };
    }

    async checkAuthorization() {
        if (this.webApiClientId) {
            try {
                const tokens = await this.readTokens();
                this.tokens = !tokens ? this.tokens : tokens;

                if (this.tokens.oauth.refresh_token) {
                    await this.refreshTokens('user');
                    await this.saveTokens(this.tokens);
                    return { headers: `XBL3.0 x=${this.tokens.xsts.DisplayClaims.xui[0].uhs};${this.tokens.xsts.Token}`, tokens: this.tokens };
                } else {
                    this.emit('error', 'No oauth token found. Use authorization manager first.')
                }
            } catch (error) {
                this.emit('error', error);
            };
        } else {
            this.emit('error', `Authorization not possible, check plugin settings - Client Id: ${this.webApiClientId}`);
        }
    }

    async generateAuthorizationUrl() {
        try {
            const payload = {
                "client_id": this.webApiClientId,
                "response_type": 'code',
                "approval_prompt": 'auto',
                "scope": CONSTANTS.WebApi.Scopes,
                "redirect_uri": CONSTANTS.WebApi.Url.Redirect
            }
            const params = QueryString.stringify(payload);
            const oauth2URI = `${CONSTANTS.WebApi.Url.oauth2}?${params}`;
            return oauth2URI;
        } catch (error) {
            this.emit('error', error);
        };
    }

    async readTokens() {
        try {
            const data = await fsPromises.readFile(this.tokensFile);
            const tokens = data.length > 0 ? JSON.parse(data) : false;
            return tokens;
        } catch (error) {
            this.emit('error', error);
        };
    }

    async saveTokens(tokens) {
        try {
            tokens = JSON.stringify(tokens, null, 2);
            await fsPromises.writeFile(this.tokensFile, tokens);
            return true;
        } catch (error) {
            this.emit('error', error);
        };
    }

    async clearTokens() {
        try {
            const tokens = JSON.stringify({
                oauth: {},
                user: {},
                xsts: {}
            }, null, 2);
            await fsPromises.writeFile(this.tokensFile, tokens);
            return true;
        } catch (error) {
            this.emit('error', error);
        };
    }
}
module.exports = Authentication;