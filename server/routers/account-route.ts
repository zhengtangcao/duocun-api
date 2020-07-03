import express from "express";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { DB } from "../db";
import { Account, AccountAttribute, IAccount, AccountType } from "../models/account";
import { MerchantStuff } from "../merchant-stuff";
import { Utils } from "../utils";
import { Config } from "../config";
import { Model, Code } from "../models/model";
import { ObjectId } from "mongodb";
import moment from "moment";
import logger from "../lib/logger";
import { OAuth2Client } from 'google-auth-library';
import https from 'https';
export function AccountRouter(db: DB) {
  const router = express.Router();
  const controller = new AccountController(db);
  
  // grocery api
  router.get('/G/', (req, res) => { controller.gv1_list(req, res); });
  router.get('/G/:id', (req, res) => { controller.gv1_getById(req, res); });
  router.get('/G/token/:id', (req, res) => { controller.gv1_getByTokenId(req, res); });

  // v2 https://duocun.ca/api/Accounts/wechatLoginByOpenId
  router.post('/wechatLoginByOpenId', (req, res) => { controller.wechatLoginByOpenId(req, res); });
  router.get('/wechatLoginByCode', (req, res) => { controller.wechatLoginByCode(req, res); });
  router.get('/qFind', (req, res) => { controller.list(req, res); }); // deprecated
  router.get('/', (req, res) => { controller.list(req, res); });
  router.get('/current', (req, res) => { controller.getCurrentAccount(req, res); });
  router.post('/googleLogin', (req, res) => { controller.googleLogin(req, res) });
  router.post('/fbLogin', (req, res) => { controller.fbLogin(req, res) });
  router.post('/googleSignUp', (req, res) => { controller.googleSignUp(req, res) });
  // v1
  // router.get('/attributes', (req, res) => { this.attrModel.quickFind(req, res); });

  // v1
  router.get('/wechatLogin', (req, res) => { controller.wechatLogin(req, res); });
  // router.post('/verifyCode', (req, res) => { controller.verifyCode(req, res); }); // deprecated

  router.get('/:id', (req, res) => { controller.get(req, res); }); // fix me

  // router.post('/', (req, res) => { controller.create(req, res); });
  // router.put('/', (req, res) => { controller.replace(req, res); });
  router.patch('/', (req, res) => { controller.update(req, res); });
  // router.delete('/', (req, res) => { controller.remove(req, res); });

  // router.post('/sendClientMsg2', (req, res) => { controller.sendClientMsg2(req, res); });
  router.post('/sendClientMsg', (req, res) => { controller.sendClientMsg(req, res); });
  router.post('/verifyPhoneNumber', (req, res) => { controller.verifyPhoneNumber(req, res); });
  router.post('/sendVerifyMsg', (req, res) => { controller.sendVerifyMsg(req, res); });
  router.post('/applyMerchant', (req, res) => { controller.merchantStuff.applyMerchant(req, res); });
  router.post('/getMerchantApplication', (req, res) => { controller.merchantStuff.getApplication(req, res); });

  router.post('/login', (req, res) => { controller.login(req, res); });
  router.post('/loginByPhone', (req, res) => { controller.loginByPhone(req, res); });
  router.route('/signup').post((req, res) => { controller.signup(req, res); });
  router.post('/registerTempAccount', (req, res) => {controller.registerTempAccount(req, res)});
  router.post('/register', (req, res) => { controller.register(req, res) });
  // when an authenticated user tries to change phone number
  router.post('/sendVerificationCode', (req, res) => { controller.gv1_sendVerificationCode(req, res) });
  // when a user tries to log in with phone number
  router.post('/sendOTPCode', (req, res) => { controller.sendOTPCode(req, res) });
  router.post('/verifyCode', (req, res) => { controller.gv1_verifyCode(req, res) });
  router.post('/saveProfile', (req, res) => { controller.gv1_update(req, res) });
  return router;
};

export class AccountController extends Model {
  accountModel: Account;
  attrModel: AccountAttribute;
  merchantStuff: MerchantStuff;
  utils: Utils;
  cfg: Config;
  googleOAuthClient: OAuth2Client;
  constructor(db: DB) {
    super(db, 'users');
    this.accountModel = new Account(db);
    this.attrModel = new AccountAttribute(db);
    this.merchantStuff = new MerchantStuff(db);
    this.utils = new Utils();
    this.cfg = new Config();
    this.googleOAuthClient = new OAuth2Client(this.cfg.GOOGLE_AUTH_CLIENT_ID);
  }

  loginByPhone(req: Request, res: Response) {
    const phone = req.body.phone;
    const verificationCode = req.body.verificationCode;

    this.accountModel.doLoginByPhone(phone, verificationCode).then((tokenId: string) => {
      if (!tokenId) {
        return res.json({
          code: Code.FAIL
        });
      } else {
        return res.json({
          code: Code.SUCCESS,
          token: tokenId
        });
      }
    });
  }

  login(req: Request, res: Response) {
    const username = req.body.username;
    const password = req.body.password;

    this.accountModel.doLogin(username, password).then((tokenId: string) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(tokenId, null, 3));
    });
  }

  wechatLogin(req: Request, res: Response) {

    const authCode: any = req.query.code;
    res.setHeader('Content-Type', 'application/json');

    this.utils.getWechatAccessToken(authCode).then((r: any) => {
      this.utils.getWechatUserInfo(r.access_token, r.openid).then((x: any) => { // IAccount
        this.accountModel.doWechatSignup(x.openid, x.nickname, x.headimgurl, x.sex).then((account: IAccount) => {
          if (account) {
            const accountId = account._id.toString();
            const tokenId = this.accountModel.jwtSign(accountId);
            res.send(JSON.stringify(tokenId, null, 3));
          } else {
            res.send(JSON.stringify('', null, 3));
          }
        });
      }, err => {
        console.log(err);
        res.send(JSON.stringify('', null, 3));
      });
    }, err => {
      console.log(err);
      res.send(JSON.stringify('', null, 3));
    });
  }


  // return  {tokenId, accessToken, openId, expiresIn}
  wechatLoginByCode(req: Request, res: Response) {
    const wxLoginCode: any = req.query.code;
    res.setHeader('Content-Type', 'application/json');
    this.accountModel.wechatLoginByCode(wxLoginCode).then((r: any) => {
      if (r && r.tokenId) {
        res.send(JSON.stringify(r, null, 3));
      } else {
        res.send(JSON.stringify('', null, 3));
      }
    }).catch( (error:any) => {
      // even exception,  let user login again
      // console.log(`err: ${error}`);
      res.send(JSON.stringify('', null, 3));
    });
  }

  // return {tokenId}
  wechatLoginByOpenId(req: Request, res: Response) {
    const openId = req.body.openId;
    const accessToken = req.body.accessToken;

    res.setHeader('Content-Type', 'application/json');
    this.accountModel.wechatLoginByOpenId(accessToken, openId).then((tokenId: any) => {
      if (tokenId) {
        res.send(JSON.stringify({tokenId}, null, 3));
      } else {
        res.send(JSON.stringify('', null, 3));
      }
    }).catch( (error: any) => {
      // even exception,  let user login again
      // console.log(`err: ${error}`);
      res.send(JSON.stringify('', null, 3));
    });
  }


  async googleLogin(req: Request, res: Response) {
    logger.info('----- BEGIN GOOGLE LOGIN -----')
    const token = req.body.token;
    const googleUserId = req.body.googleUserId;
    logger.info(`Trying to goolge login. Clamied token: ${token}, googleUserId: ${googleUserId}`);
    logger.info("Verifying id token");
    const ticket = await this.googleOAuthClient.verifyIdToken({
      idToken: token,
      audience: this.cfg.GOOGLE_AUTH_CLIENT_ID,
    });
    const payload = await ticket.getPayload();
    const userId = payload?.sub;
    logger.info("Verified google user id: " + userId);
    if (googleUserId != userId) {
      logger.info("Google user id mismatch" + userId);
      logger.info("----- END GOOGLE LOGIN -----");
      return res.json({
        code: Code.FAIL,
        msg: "google_user_id_mismatch",
      });
    }
    let account = await this.accountModel.findOne({
      googleUserId,
      type: { $ne: "tmp" },
    });
    if (!account) {
      logger.info('No user found with such google user id')
      account = {
        googleUserId,
        username:
          payload?.name || `user${this.accountModel.getRandomCode()}`,
        imageurl: payload?.picture,
        type: "client",
        sex: 0,
        balance: 0,
      };
      account = await this.accountModel.insertOne(account);
      logger.info(
        "Created a new user, id: " +
          account._id +
          ", username: " +
          account.username
      );
    }
    const tokenId = this.accountModel.jwtSign(account._id.toString());
    logger.info("Google login successful, account ID: " + account._id + " username: " + account.username);
    logger.info('----- END GOOGLE LOGIN -----');
    return res.json({
      code: Code.SUCCESS,
      token: tokenId
    })
  }

  async fbLogin(req: Request, res: Response) {
    logger.info("----- BEGIN FACEBOOK LOGIN -----");
    const { accessToken, userId } = req.body;
    if (!accessToken || !userId) {
      return res.json({
        code: Code.FAIL
      });
    }
    logger.info(`Access token: ${accessToken}, User ID: ${userId}`);

    https
      .get(
        `https://graph.facebook.com/${userId}?access_token=${accessToken}&locale=en_US`,
        (response) => {
          let fbResponse = '';
          response.on('data', (d) => {
            fbResponse += d;
          });
          response.on('end', async () => {
            const fbUser = JSON.parse(fbResponse);
            if (!fbUser || !fbUser.id) {
              logger.info("User info is not correct");
              logger.info(fbResponse);
              logger.info("-----  END FACEBOOK LOGIN  -----");
              return res.json({
                code: Code.FAIL
              });
            }
            let account = await this.accountModel.findOne({
              fbUserId: fbUser.id,
              type: { $ne: 'tmp' },
            });
            if (!account) {
              logger.info("No such user with that facebook user id");
              account = {
                fbUserId: fbUser.id,
                username: fbUser.name,
                imageurl: fbUser.profile_pic,
                type: "client",
                sex: 0,
                balance: 0,
              };
              account = await this.accountModel.insertOne(account);
              logger.info(
                "Created a new user, id: " +
                  account._id +
                  ", username: " +
                  account.username
              );
            }
            const tokenId = this.accountModel.jwtSign(account._id.toString());
            logger.info("Facebook login successful, account ID: " + account._id + " username: " + account.username);
            logger.info('----- END FACEBOOK LOGIN -----');
            return res.json({
              code: Code.SUCCESS,
              token: tokenId
            });
          });
        }
      )
      .on('error', (e) => {
        logger.error(e);
        logger.info("-----  END FACEBOOK LOGIN  -----");
      })
    logger.info("-----  END FACEBOOK LOGIN  -----");
  }

  async googleSignUp(req: Request, res: Response) {
    logger.info('--- BEGIN GOOGLE REGISTER ---')
    const token = req.body.token;
    const googleUserId = req.body.googleUserId;
    logger.info(`Trying to goolge sign up. Clamied token: ${token}, googleUserId: ${googleUserId}`)
    let account = await this.accountModel.findOne({
      googleUserId,
      type: { $ne: "tmp" },
      verified: true,
    });
    if (account) {
      logger.info('user already exists');
      logger.info('--- END GOOGLE REGISTER ---')
      return res.json({
        code: Code.SUCCESS,
        token: this.accountModel.jwtSign(account._id.toString())
      });
    }
    logger.info('Verifying id token')
    const ticket = await this.googleOAuthClient.verifyIdToken({
      idToken: token,
      audience: this.cfg.GOOGLE_AUTH_CLIENT_ID
    });
    const payload = await ticket.getPayload();
    const userId = payload?.sub;
    logger.info('Verified google user id: ' +  userId);
    if (googleUserId != userId) {
      logger.info('Google user id mismatch' +  userId);
      logger.info('----- END GOOGLE LOGIN -----');
      return res.json({
        code: Code.FAIL,
        msg: 'google_user_id_mismatch'
      });
    }
    account = {
      googleUserId,
      username: req.body.username || `user${this.accountModel.getRandomCode()}`,
      imageurl: req.body.imageurl,
      type: 'client',
      sex: 0,
      balance: 0,
    };
    account = await this.accountModel.insertOne(account);
    logger.info('Created a new user, id: ' + account._id + ', username: ' + account.username);
    logger.info('--- END GOOGLE REGISTER ---')
    return res.json({
      code: Code.SUCCESS,
      token: this.accountModel.jwtSign(account._id.toString())
    })
  }

  // req --- require accountId, username and phone fields
  sendVerifyMsg(req: Request, res: Response) {
    const self = this;
    const lang = req.body.lang;
    const accountId = req.body.accountId;
    const phone = req.body.phone;

    this.accountModel.trySignupV2(accountId, phone).then((r: any) => {
      res.setHeader('Content-Type', 'application/json');
      if (r.phone) {
        const text = (lang === 'en' ? 'Duocun Verification Code: ' : '多村验证码: ') + r.verificationCode;
        this.accountModel.sendMessage(r.phone, text).then(() => {
          if (r.accountId) {
            const tokenId = this.accountModel.jwtSign(r.accountId);
            res.send(JSON.stringify(tokenId, null, 3));
          } else {
            res.send(JSON.stringify('', null, 3)); // sign up fail, please contact admin
          }
        }).catch((e) => {
          console.error(e);
          res.send(JSON.stringify('', null, 3));
        });
      } else {
        res.send(JSON.stringify('', null, 3)); // sign up fail, please contact admin
      }
    });

  }

  verifyPhoneNumber(req: Request, res: Response) {
    const loggedInAccountId = req.body.accountId;
    const phone = req.body.phone;
    const code = req.body.code;

    this.accountModel.verifyPhoneNumber(phone, code, loggedInAccountId).then((r: any) => {
      this.accountModel.updateAccountVerified(r).then((ret) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(ret, null, 3));
      });
    });
  }

  sendClientMsg(req: Request, res: Response) {
    const self = this;
    const lang = req.body.lang;
    const phone = req.body.phone;
    const orderType = req.body.orderType;

    res.setHeader('Content-Type', 'application/json');

    let txt;
    if (orderType === 'G') {
      txt = lang === 'en' ? 'Reminder: Your delivery arrived.' : '多村提醒您: 货已送到, 请查收。(系统短信, 勿回)';
    } else {
      txt = lang === 'en' ? 'Reminder: Your delivery arrived.' : '多村提醒您: 餐已送到, 请查收。(系统短信, 勿回)';
    }

    self.accountModel.sendMessage(phone, txt).then(() => {
      res.send(JSON.stringify('', null, 3)); // sign up fail, please contact admin
    }).catch((e) => {
      console.error(e);
      res.send(JSON.stringify('', null, 3));
    });
  }

  // v1 --- deprecated
  // verifyCode(req: Request, res: Response) {
  //   const phone = req.body.phone;
  //   let code = req.body.code;
  //   this.accountModel.doVerifyPhone(phone, code).then((verified) => {
  //     res.setHeader('Content-Type', 'application/json');
  //     res.send(JSON.stringify(verified, null, 3));
  //   });
  // }

  list(req: Request, res: Response) {
    let query = {};
    const params = req.query;

    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }
    query = this.accountModel.convertIdFields(query);

    if (params && params.keyword) {
      query = { username: {'$regex': params.keyword} };
    }

    this.accountModel.find(query).then(accounts => {
      accounts.forEach((account: any) => {
        if (account && account.password) {
          delete account.password;
        }
      });
      res.setHeader('Content-Type', 'application/json');
      res.send(accounts);
    });
  }

  getCurrentAccount(req: Request, res: Response) {
    const tokenId: any = req.query.tokenId;

    this.accountModel.getAccountByToken(tokenId).then(account => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(account, null, 3));
    });
  }

  signup(req: Request, res: Response) {
    const phone = req.body.phone.toString();
    const code: string = req.body.verificationCode.toString();

    this.accountModel.doSignup(phone, code).then((account: any) => {
      res.setHeader('Content-Type', 'application/json');
      const tokenId = this.accountModel.jwtSign(account._id.toString());
      res.send(JSON.stringify(tokenId, null, 3));
    });
  }


  // gv1

  // optional --- status
  gv1_list(req: Request, res: Response) {
    const status = req.query.status;
    const query = status ? {status} : {};
    this.accountModel.find(query).then(accounts => {
      accounts.map((account: any) => {
        if (account && account.password) {
          delete account.password;
        }
      });
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: Code.SUCCESS,
        data: accounts 
      }));
    });
  }

  // id
  gv1_getById(req: Request, res: Response) {
    const id = req.params.id;
    this.accountModel.getById(id).then(account => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: account ? Code.SUCCESS : Code.FAIL,
        data: account
      }));
    });
  }

  // id
  gv1_getByTokenId(req: Request, res: Response) {
    const tokenId: any = req.params.id;
    this.accountModel.getAccountByToken(tokenId).then(account => {
      if (account) {
        delete account.password;
        delete account.newPhone;
        delete account.verificationCode;
      }
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: account ? Code.SUCCESS : Code.FAIL,
        data: account
      }));
    });
  }

  async sendOTPCode(req: Request, res: Response) {
    let phone = req.body.phone;
    const account = await this.accountModel.findOne({phone});
    if (!account) {
      return res.json({
        code: Code.FAIL,
        message: "no such account"
      });
    }
    const code = this.accountModel.getRandomCode();
    account.verificationCode = code;
    try {
      await this.accountModel.updateOne({_id: account._id}, account);
      await this.accountModel.sendMessage(account.phone, account.verificationCode);
    } catch (e) {
      return res.json({
        code: Code.FAIL,
        message: e
      });
    }
    return res.json({
      code: Code.SUCCESS
    });
  }

  async gv1_sendVerificationCode(req: Request, res: Response) {
    res.setHeader('Content-Type', 'application/json');
    let token: string = req.get('Authorization') || "";
    token = token.replace("Bearer ", "");
    const cfg = new Config();
    let accountId = "";
    try {
      const jwtPayload: any = jwt.verify(token, cfg.JWT.SECRET);
      accountId = jwtPayload.accountId;
    } catch (e) {
      console.error(e);
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "authentication failed"
      }));
    }
    let newPhone = req.body.phone;
    if (!newPhone) {
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "phone number missing"
      }));
    }
    const account = await this.accountModel.findOne({_id: new ObjectId(accountId)});
    if (!account) {
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "no such account"
      }));
    }
    newPhone = newPhone.substring(0,2) === "+1" ? newPhone.substring(2) : newPhone;
    account.newPhone = newPhone;
    const code = this.accountModel.getRandomCode();
    account.verificationCode = code;
    try {
      await this.accountModel.sendMessage(account.newPhone, account.verificationCode);
      await this.accountModel.updateOne({ _id: accountId }, account);
    } catch (e) {
      console.error(e);
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: e
      }));
    }
    res.send(JSON.stringify({
      code: Code.SUCCESS,
      /**
       * for development purpose only
       */
      // message: account.verificationCode
    }));
  }

  async gv1_verifyCode(req: Request, res: Response) {
    res.setHeader('Content-Type', 'application/json');
    let token: string = req.get('Authorization') || "";
    token = token.replace("Bearer ", "");
    const cfg = new Config();
    let accountId = "";
    try {
      // @ts-ignore
      accountId = (jwt.verify(token, cfg.JWT.SECRET)).accountId;
    } catch (e) {
      console.error(e);
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "authentication failed"
      }));
    }
    let newPhone = req.body.newPhone;
    let code = req.body.code;
    if (!newPhone || !code) {
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "phone number or verification code is missing"
      }));
    }
    const account = await this.accountModel.findOne({ _id: new ObjectId(accountId) });
    if (!account) {
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "no such account"
      }));
    }
    if (account.newPhone == newPhone && account.verificationCode == code) {
      account.phone = account.newPhone;
      delete(account.newPhone);
      delete(account.verificationCode);
      account.verified = true;
      await this.accountModel.updateOne({ _id: accountId }, account);
      return res.send(JSON.stringify({
        code: Code.SUCCESS,
        data: account
      }));
    } else {
      return res.send(JSON.stringify({
        code: Code.FAIL,
        /**
         * for development purpose only
         */
        // data: account
      }));
    }
  }

  async gv1_update(req: Request, res: Response) {
    res.setHeader('Content-Type', 'application/json');
    let token: string = req.get('Authorization') || "";
    token = token.replace("Bearer ", "");
    const cfg = new Config();
    let accountId = "";
    try {
      //@ts-ignore
      accountId = (jwt.verify(token, cfg.JWT.SECRET)).accountId;
    } catch (e) {
      console.error(e);
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "authentication failed"
      }));
    }
    let account = await this.accountModel.findOne({ _id: new ObjectId(accountId) });
    if (!account) {
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "no such account"
      }));
    }
    logger.info("--- BEGIN ACCOUNT PROFILE CHANGE ---");
    logger.info(`Account ID: ${account._id}, username: ${account.username}`);
    let { location, secondPhone, newPhone, code, username } = req.body;
    logger.info(`newPhone: ${newPhone}, oldPhone: ${account.phone}`)
    if (newPhone !== account.phone) {
      logger.info("trying to change phone number");
      if (account.newPhone === newPhone && account.verificationCode === code) {
        // find existing account with new phone
        logger.info("verification code matches");
        const existingAccount = await this.accountModel.findOne({ phone: newPhone });
        if (existingAccount && existingAccount._id.toString() !== account._id.toString()) {
          logger.info(`Account with same phone number exists. Account ID: ${existingAccount._id}, username: ${existingAccount.username}`);
          logger.info("merge two accounts");
          existingAccount.imageurl = existingAccount.imageurl || account.imageurl;
          existingAccount.realm = existingAccount.realm || account.realm;
          existingAccount.openId = existingAccount.openId || account.openId;
          existingAccount.unionId = existingAccount.unionId || account.unionId;
          existingAccount.visited = existingAccount.visited || account.visited;
          existingAccount.balance = (existingAccount.balance || 0) + (account.balance || 0);
          existingAccount.sex = existingAccount.sex === undefined ? account.sex : existingAccount.sex;
          existingAccount.attributes = existingAccount.attributes || account.attributes;
          if (existingAccount.type && existingAccount.type != 'client' && existingAccount.type != 'user') {

          } else {
            existingAccount.type = existingAccount.type || account.type;
          }
          if (account.type && account.type != 'client' && account.type != 'user' && account.type != 'tmp') {
            existingAccount.type = account.type;
          }
          logger.info("Disabling new account: " + accountId);
          account.openId = account.openId + "_disabled";
          account.unionId = account.unionId + "_disabled";
          account.phone = account.phone + "_disabled";
          account.type = "tmp";
          await this.accountModel.updateOne({ _id: account._id }, account);
          account = existingAccount;
        }
        account.phone = newPhone;
        account.newPhone = "";
        account.verificationCode = this.accountModel.getRandomCode();
        account.verified = true;
      } else {
        logger.info("verification code mismatch");
        logger.info(`Verification code is ${account.verificationCode}, but received ${code}`);
        logger.info("--- END ACCOUNT PROFILE CHANGE ---");
        return res.json({
          code: Code.FAIL,
          message: "verification code mismatch"
        });
      }
    }
    account.username = username;
    account.location = location;
    if (!location) {
      account.location = null;
    }
    if (secondPhone) {
      secondPhone = secondPhone.substring(0,2) === "+1" ? secondPhone.substring(2) : secondPhone;
      account.secondPhone = secondPhone;
    }
    try {
      logger.info("Saving account");
      await this.accountModel.updateOne({ _id: account._id }, account);
      logger.info("--- END ACCOUNT PROFILE CHANGE ---");
      return res.send(JSON.stringify({
        code: Code.SUCCESS,
        data: jwt.sign({accountId: account._id.toString()}, this.cfg.JWT.SECRET, {
          expiresIn: '30d'
        })
      }));
    } catch(e) {
      logger.error("Save failed, " + e);
      logger.info("--- END ACCOUNT PROFILE CHANGE ---");
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "save failed"
      }));
    }
  }

  async registerTempAccount(req: Request, res: Response) {
    let phone = req.body.phone;
    if (!phone) {
      return res.json({
        code: Code.FAIL,
        message: "phone number is empty"
      });
    }
    phone = phone.substring(0, 2) === "+1" ? phone.substring(2): phone;
    const existing = await this.accountModel.findOne({phone, type: { $ne: AccountType.TEMP }});
    if (existing) {
      return res.json({
        code: Code.FAIL,
        message: "phone number already exists"
      });
    }
    const user = {
      phone,
      verificationCode: this.accountModel.getRandomCode(),
      type: AccountType.TEMP,
      verified: false
    };
    try {
      let twilio = await this.accountModel.sendMessage(user.phone, user.verificationCode);
      await this.accountModel.updateOne({ phone }, user, { upsert: true });
    } catch(e) {
      console.error(e);
      return res.json({
        code: Code.FAIL,
        message: e
      });
    }
    return res.json({
      code: Code.SUCCESS
    });
  }

  async register(req: Request, res: Response) {
    let phone = req.body.phone;
    phone = phone.substring(0, 2) === "+1" ? phone.substring(2): phone;
    const username = req.body.username;
    const verificationCode = req.body.verificationCode;
    if (!username) {
      return res.json({
        code: Code.FAIL,
        message: "username is empty"
      });
    }
    
    const user = await this.accountModel.findOne({ phone, verificationCode, type: AccountType.TEMP });
    if (!user) {
      return res.json({
        code: Code.FAIL
      });
    }
    const existing = await this.accountModel.findOne({ phone, type: { $ne: AccountType.TEMP } });
    if (existing) {
      return res.json({
        code: Code.FAIL,
        message: "phone number already exists"
      });
    }
    user.username = username;
    user.verified = true;
    user.type = AccountType.CLIENT;
    user.created = moment().toISOString();
    if (!user.balance) {
      user.balance = 0;
    }
    try {
      await this.accountModel.updateOne({ _id: user._id }, user);
    } catch (e) {
      return res.json({
        code: Code.FAIL,
        message: e
      });
    }
    return res.json({
      code: Code.SUCCESS,
      token: jwt.sign({accountId: user._id.toString()}, this.cfg.JWT.SECRET, {
        expiresIn: '30d'
      })
    });
  }

}
