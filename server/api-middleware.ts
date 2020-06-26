import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Config } from "./config";

export class ApiMiddleWare {
  constructor(options?: any) {}

  auth(req: Request, res: Response, next: any) {
    let token = req.get("Authorization") || "";
    token = token.replace("Bearer ", "");

    if (
      req.path === "/api/Accounts/wxLogin" ||
      req.path === "/api/Accounts/wechatLogin" ||
      req.path === "/api/Accounts/login" ||
      req.path === "/api/Accounts/signup" ||
      req.path === "/api/Accounts/logout" ||
      req.path === "/api/Accounts/loginByPhone" ||
      req.path === "/api/Accounts/verifyCode" ||
      req.path === "/api/Accounts/sendVerifyMsg" ||
      req.path === "/api/Accounts/sendOTPCode" ||
      req.path === "/api/Accounts/verifyAndLogin" ||
      req.path === "/api/Accounts/registerTempAccount" ||
      req.path === "/api/Accounts/register" ||
      req.path === "/api/Accounts/googleLogin" ||
      req.path === "/api/Accounts/googleSignUp" ||
      req.path.indexOf("/api/Accounts/wechatLoginByOpenId") !== -1 ||
      req.path.indexOf("/api/Accounts/wechatLoginByCode") !== -1 ||
      req.path === "/api/Categories/G" ||
      req.path === "/api/Pages/loadTabs" ||
      req.path === "/api/Areas/G/my" ||
      req.path === "/api/EventLogs" ||
      (req.path && req.path.startsWith("/api/Pages/page")) ||
      req.path === "/api/MerchantSchedules/availableMerchants" ||
      (req.method === "GET" && req.path.indexOf("/api/Accounts") !== -1) ||
      req.path.indexOf("/api/Locations") !== -1 ||
      req.path.indexOf("/api/Restaurants") !== -1 ||
      req.path.indexOf("/api/Products") !== -1 ||
      req.path === "/api/Restaurants" ||
      req.path === "/api/Restaurants/qFind" ||
      req.path === "/api/Restaurants/load" ||
      req.path === "/api/Products" ||
      req.path === "/api/Products/qFind" ||
      req.path === "/api/Products/categorize" ||
      (req.path.includes("/api/products") && req.method == "GET") ||
      req.path === "/api/Pages/loadTabs" ||
      req.path === "/api/Ranges" ||
      req.path === "/api/Ranges/overRange" ||
      req.path === "/api/Ranges/inRange" ||
      req.path === "/api/ClientPayments/notify" ||
      req.path === "/api/ClientPayments/alphapay/success" ||
      (req.path.includes("/api/Categories/G") && req.method == "GET") ||
      req.path.includes(".jpeg") ||
      req.path.includes(".jpg") ||
      req.path.includes(".png")
    ) {
      next();
    } else {
      res.setHeader("Content-Type", "application/json");
      const cfg = new Config();
      if (token) {
        try {
          let accountId: any = jwt.verify(token, cfg.JWT.SECRET);
          accountId = accountId.accountId;
          // TODO: compare redis token
          if (accountId) {
            next();
          } else {
            // return res.send(JSON.stringify({err: 401, msg:"Authorization: bad token"}, null, 3));
            return res.status(401).send("Authorization: bad token");
          }
        } catch (err) {
          // return res.send(JSON.stringify({err: 401, msg:"Authorization: bad token"}, null, 3));
          return res.status(401).send("Authorization: bad token err=" + err);
        }
      } else {
        return res.status(401).send("API Authorization token is required.");
      }
    }
  }
}
