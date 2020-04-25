import { DB } from "../db";
import { Model } from "./model";
import { Request, Response } from "express";
import { Area } from "./area";
import moment from 'moment';

export class MerchantSchedule extends Model{
  areaModel: Area;
  constructor(dbo: DB) {
    super(dbo, 'merchant_schedules');
    this.areaModel = new Area(dbo);
  }

  createOrUpdate(data: any){
    const areaId = data.areaId;
    const areaCode = data.areaCode;
    const merchantIds = data.merchantIds; // all merchants
    const weeks = data.weeks.split(',');
    const rules = weeks.map((week: string) => ({
        pickup: {dow: week, time: '10:00'},
        deliver: {dow: week, time: '10:00'},
      }));
    const existMerchantIds: string[] = [];
    const datas: any[] = [];

    return new Promise(resolve => {
      this.find({areaId}).then(mss => {
        mss.forEach(ms => {
          existMerchantIds.push(ms.merchantId.toString());
          datas.push({
            query: { _id: ms._id },
            data: { areaId, areaCode, rules }
          });
        });
        this.bulkUpdate(datas).then(() => {
          const remainIds = merchantIds.filter((mId: string) => existMerchantIds.indexOf(mId) === -1);
          this.createMany(areaId, areaCode, rules, remainIds);
          resolve();
        });
      });
    });
  }

  createMany(areaId: string, areaCode: string, rules: any[], ids: string[]){
    for(let i=0; i<ids.length; i++){
      const merchantId = ids[i];
      const data = {
        areaId,
        areaCode,
        merchantId,
        rules
      }
      this.insertOne(data).then(() => {

      });
    }
  }


  getAvailableMerchants(req: Request, res: Response) {
    let fields: any;
    let data: any;
    if (req.headers) {
      if (req.headers.data && typeof req.headers.data === 'string') {
        data = JSON.parse(req.headers.data);
      }
      if (req.headers.fields && typeof req.headers.fields === 'string') {
        fields = JSON.parse(req.headers.fields);
      }
    }
    
    const areaId = data.areaId;
    this.find({areaId}).then(mss =>{
      if(mss && mss.length > 0){
        const merchantIds = mss.map((ms: any) => ms.merchantId.toString());
        res.send(JSON.stringify(merchantIds, null, 3));
      }else{
        res.send(JSON.stringify(null, null, 3));
      }
    });
  }
}