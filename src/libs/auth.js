'use-strict';
/* eslint-disable no-mixed-spaces-and-tabs */
const axios = require('axios').default;
const tough = require('tough-cookie');
const ClientLoginAdapter = require('epicgames-client-login-adapter');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tokens = require('../utils/tokens');
const Endpoints = require('../utils/endpoints');
const { stringify } = require('querystring');
const fs = require('fs').promises;
axiosCookieJarSupport(axios);
const cookieJar = new tough.CookieJar();
const deviceAuthPath = `${__dirname}/deviceAuthDetails.json`;
const exchangeCode = 'd2ad778847474e75b0d73da376fd8551';
const {email, password} = require('../config.json');


/*
  Credit to ThisNils for the device auth example.
  https://gist.github.com/ThisNils/23c5dc9a49164e5419219a1654c0827c

*/

class Auth {
  constructor () {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36';
  }
  
  async GenerateDeviceAuth(code) {
    if (!code) {
      const instance = axios.create({ jar: cookieJar, withCredentials: true });
      
      // As I am now using a library to get the exchange code... I don't need the requests for reputation & csrf.
      // I'm not going to remove it though, as I want to implement my own library for bypassing captcha
      console.log('[AUTH]','Requesting reputation');
      // await instance.get(Endpoints.API_REPUTATION, { headers: { 'User-Agent': this.userAgent }, responseType: 'json' });
      console.log('[AUTH]','Requesting csrf');
      // await instance.get(Endpoints.CSRF_TOKEN, { headers: { 'User-Agent': this.userAgent } });
      //const csrf = cookieJar.toJSON().cookies.find((x) => x.key === 'XSRF-TOKEN');


      console.log('[AUTH]','Requesting LOGIN');
      const clientLoginAdapter = await ClientLoginAdapter.init({
        login: email,
        password: password
      });
      code = await clientLoginAdapter.getExchangeCode();
      await clientLoginAdapter.close();
    }
    console.log(code);

    const iosToken = await axios
      .post(Endpoints.OAUTH_TOKEN, stringify({ grant_type: 'exchange_code', exchange_code: code }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `basic ${tokens.launcherToken}`,
          'User-Agent': this.userAgent,
        },
        responseType: 'json',
      })
      .then((res) => {
        return res.data;
      });

    const deviceAuthDetails = await axios
      .post(
        `${Endpoints.DEVICE_AUTH}/${iosToken.account_id}/deviceAuth`,
        {},
        { headers: { Authorization: `bearer ${iosToken.access_token}` }, responseType: 'json' },
      )
      .then((res) => {
        return res.data;
      });
    return {
      accountId: deviceAuthDetails.accountId,
      deviceId: deviceAuthDetails.deviceId,
      secret: deviceAuthDetails.secret,
    };
  }
  async getDeviceAuth(exchange) {
    let deviceAuthDetails;
    let deviceAuthFileBuffer = '';
    try {
      deviceAuthFileBuffer = await fs.readFile(deviceAuthPath);
    } catch (err) {
      await fs.writeFile(deviceAuthPath, '');
    }
    if (deviceAuthFileBuffer.length !== 0) {
      deviceAuthDetails = JSON.parse(deviceAuthFileBuffer);
    } else {
      deviceAuthDetails = await this.GenerateDeviceAuth(exchange);
      await fs.writeFile(deviceAuthPath, JSON.stringify(deviceAuthDetails));
    }
    const authData = {
      grant_type: 'device_auth',
      account_id: deviceAuthDetails.accountId,
      device_id: deviceAuthDetails.deviceId,
      secret: deviceAuthDetails.secret,
    };
    const fortniteToken = await axios
      .post(Endpoints.OAUTH_TOKEN, stringify(authData), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `basic ${tokens.launcherToken}`,
        },
        responseType: 'json',
      })
      .then((res) => {
        return res.data;
      });
    // console.log(`Your fortnite token is ${fortniteToken.access_token}`);
    return fortniteToken.access_token;
  }
  /**
   * Get OAuth Token for Fortnite Game access
   * @param {string} exchange Token from getOAuthExchangeToken()
   * @returns {object} JSON Object of result
   */
  async getFortniteOAuthToken(exchange) {
    const headers = {};
    headers['Authorization'] = `basic ${tokens.fortniteToken}`;
    const res = await axios({
      url: Endpoints.OAUTH_TOKEN,
      headers: headers,
      method: 'POST',
      data: stringify({
        GRANT_TYPE: 'exchange_code',
        EXCHANGE_CODE: exchange,
        includePerms: false,
        TOKEN_TYPE: 'eg1',
      }),
    })
      .then((response) => {
        return response.data.access_token;
      })
      .catch((error) => {
        if (error.response) {
          console.log(error.response.data);
          console.log(error.reponse.status);
        } else if (error.request) {
          console.log(error.request);
        } else {
          console.log('Error', error.message);
        }
      });
    return res;
  }
  /**
   *
   * @param {string} token access_token from login data
   * @returns {object} Json objext of result
   */
  async getOAuthExchangeToken(token) {
    const headers = {};
    headers['Authorization'] = `bearer ${token}`;
    const res = await axios({
      url: Endpoints.OAUTH_EXCHANGE,
      headers: headers,
      method: 'GET',
    })
      .then((response) => {
        return response.data.code;
      })
      .catch(function (error) {
        return { error: `[getOAuthExchangeToken] Unknown response from gateway ${Endpoints.OAUTH_EXCHANGE}` };
      });
    return res;
  }

  /**
   *
   * @param {string} newAuth,fixAuth,null.
   * @returns {object} Json objext of result
   */
  async login(authType , exchangeCode) {
    if (authType === 'newAuth') {
      await this.GenerateDeviceAuth();
      const token = await this.getDeviceAuth();
      return token;
    } else if (authType === 'fixauth'){
      const token = await this.getDeviceAuth(exchangeCode);
      return token;
    } else {
      const token = await this.getDeviceAuth('');
      return token;
    }   
  }
}
module.exports = Auth;