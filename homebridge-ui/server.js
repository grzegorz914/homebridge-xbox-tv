const {
  HomebridgePluginUiServer,
  RequestError
} = require('@homebridge/plugin-ui-utils');
const XboxWebApi = require('xbox-webapi');

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    // super() MUST be called first
    super();

    this.data = {};
    // handle request for the /data route
    this.onRequest('/data', this.getData.bind(this));

    // this MUST be called when you are ready to accept requests
    this.ready();
  }

  async getData(payload) {
    console.log('Incomming token %s:, host: %s, clientId: %s.', payload.token, payload.host, payload.clientId);

    try {
      const token = payload.token;
      const host = payload.host;
      const clientId = payload.clientId;
      const clientSecret = payload.clientSecret;
      const authTokenFile = this.homebridgeStoragePath + '/xboxTv/authToken_' + host.split('.').join('');

      const webApiCheck = XboxWebApi({
        clientId: clientId,
        clientSecret: clientSecret,
        userToken: '',
        uhs: ''
      });

      webApiCheck._authentication._tokensFile = authTokenFile;
      webApiCheck.isAuthenticated().then(() => {
        this.data = {
          res: 'Console already authenticated',
          status: 0
        }
      }).catch(() => {
        if (token != undefined) {
          webApiCheck._authentication.getTokenRequest(token).then((authToken) => {
            webApiCheck._authentication._tokens.oauth = authToken;
            webApiCheck._authentication.saveTokens();
            this.data = {
              res: 'Console successfully authenticated and *autToken* file saved',
              status: 3
            }
          }).catch(() => {
            this.data = {
              res: 'Authorization and Token file saved error.',
              status: 4
            }
          });
        } else {
          this.data = {
            res: 'Authorization link empty, check *authToken* file.',
            status: 2
          }
        }
        const oauth2URI = webApiCheck._authentication.generateAuthorizationUrl();
        this.data = {
          res: oauth2URI,
          status: 1
        }
      });

      return this.data;
    } catch (e) {
      throw new RequestError('Failed to return data try again.', {
        message: e.message
      });
    }
  }
}

(() => {
  return new PluginUiServer();
})();