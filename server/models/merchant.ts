import { DB } from "../db";
import { Model } from "./model";
import { Entity } from "../entity";
import { Mall, IMall, IDbMall } from "./mall";
import { Distance, ILocation, IDistance, IPlace } from "./distance";
import { Area, ILatLng, IArea, AppType } from "./area";
import { Range, IRange } from './range';
import { ObjectID, Collection, ObjectId } from "mongodb";
import moment from "moment";
import { IAccount, Account } from "./account";
import { MerchantSchedule } from "./merchant-schedule";
import { DateTime } from "./date-time";

export const MerchantType = {
  RESTAURANT: 'R',
  GROCERY: 'G',
  FRESH: 'F',
  TELECOM: 'T'
};

export interface IPhase {
  orderEnd: string; // hh:mm
  pickup: string; // hh:mm
}

export interface IMerchant {
  _id: string;
  name: string;
  nameEN: string;
  description: string;
  // location: ILatLng; // lat lng
  accountId: string;
  mallId: string;
  address: string;
  closed: string[];
  dow: string;          // day of week opening, eg. '1,2,3,4,5'
  pictures: string[];
  phases: IPhase[];
  type: string;
  created: string;
  modified: string;

  // optional field
  account?: IAccount;
  mall?: IMall;
  distance?: number;  // km
  inRange?: boolean;
  orderEnded?: boolean;
  orderEndTime?: string;
  isClosed?: boolean;

  order?: number;
  onSchedule?: boolean;
}

export interface IDbMerchant {
  _id: ObjectId;
  name: string;
  nameEN: string;
  description: string;
  accountId: ObjectId;
  mallId: ObjectId;
  pictures: any[];
  closed: string[];
  dow: string;           // day of week opening, eg. '1,2,3,4,5'
  type: string;
  created: string;
  modified: string;

  mall?: IDbMall;

  location: ILatLng;      // lat lng
  malls: string[];        // mall id
  address: string;
  order?: number;
  // inRange: boolean;
  onSchedule: boolean;
  phases: IPhase[];
}

export class Merchant extends Model {
  mallModel: Mall;
  accountModel: Account;
  distance: Distance;
  rangeModel: Range;

  areaModel: Area;
  scheduleModel: MerchantSchedule;

  constructor(dbo: DB) {
    super(dbo, 'merchants');
    this.mallModel = new Mall(dbo);
    this.accountModel = new Account(dbo);
    this.distance = new Distance(dbo);
    this.areaModel = new Area(dbo);
    this.rangeModel = new Range(dbo);
    this.scheduleModel = new MerchantSchedule(dbo);
  }
  // this.merchantSvc.quickFind(query).then((rs: IMerchant[]) => {
  //   if (areaId) {
  //     this.merchantSchduleSvc.getAvailableMerchants(areaId).then((merchantIds: any[]) => {
  //       if (merchantIds && merchantIds.length > 0) {
  //         const availables = rs.filter(m => merchantIds.indexOf(m._id) !== -1);
  //         self.merchants = availables;
  //         res(availables);
  //       } else {
  //         self.merchants = [];
  //         res([]);
  //       }
  //     });
  //   } else {
  //     self.merchants = rs;
  //     res(rs);
  //   }
  // });

  // v2
  async getAvailableMerchants(lat: number, lng: number, query: any, appType=AppType.GROCERY) {
    if(lat && lng){
      const area = await this.areaModel.getMyArea({lat, lng}, AppType.GROCERY);
      if (area) {
        const areaId = area._id.toString();

        if(appType === AppType.GROCERY){
          const schedules = await this.scheduleModel.find({ areaId });
          const merchantIds = schedules.map((ms: any) => ms.merchantId.toString());
          const q = { ...query, _id: { $in: merchantIds } };
          return await this.find(q);
        }else{
          return await this.find(query);
        }
      } else {
        return [];
      }
    }else{
      return [];
    }
  }

  async getMySchedules(location: ILocation, merchantId: string, fields: any[]) {
    if(location && location.placeId){
      const area = await this.areaModel.getMyArea(location, AppType.GROCERY);
      if(area){
        const areaId = area._id.toString();
        return await this.scheduleModel.find({merchantId, areaId});
      }else{
        return [];
      }
    }else{
      return [];
    }
  }

  async getByAccountId(merchantAccountId: string) {
    const account = await this.accountModel.findOne({ _id: merchantAccountId });
    if (account && account.merchants && account.merchants.length > 0) {
      const merchantIds: string[] = [];
      account.merchants.map((mId: string) => {
        merchantIds.push(mId);
      });
      const query = this.convertIdFields({ _id: { $in: merchantIds } });
      return await this.joinFind(query);
    } else {
      return [];
    }
  }
  
  // v1

  // only central area has late order end time in it's last phase
  isOrderEnded(t: moment.Moment, deliveryDate: moment.Moment, area: IArea, phases: IPhase[]) {
    const last = area.code === 'C' ? phases[phases.length - 1].orderEnd : phases[0].orderEnd;
    const first = phases[0].orderEnd;
    if (t.isAfter(this.getLocalTime(deliveryDate, last))) {
      return true;
    } else {
      if (t.isAfter(this.getLocalTime(deliveryDate, first))) {
        if (area.code === 'C') {
          return false;
        } else {
          return true;
        }
      } else {
        return false;
      }
    }
  }

  // Then Order End Time display on client merchant list
  getOrderEndTime(phases: IPhase[], area?: IArea) {
    if (area) {
      const last = area.code === 'C' ? phases[phases.length - 1].orderEnd : phases[0].orderEnd;
      const first = phases[0].orderEnd;
      if (area.code === 'C') {
        return last;
      } else {
        return first;
      }
    } else {
      return '';
    }
  }

  // ----------------------------------------------------------------------------
  // dow ---- string '0,1,2,3,4,5,6'
  // dt --- moment object
  isOpeningDayOfWeek(dt: moment.Moment, dow: string) {
    if (dow && dt) {
      const days = dow.split(',');
      if (days && days.length > 0) {
        const r = days.find(d => +d === dt.day());
        return r ? true : false;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  // ------------------------------------------------------------------------------
  // s --- must be '2019-10-22' or '2019-11-03T13:52:59.566Z' format
  getDateString(s: string) {
    if (typeof s === 'string') {
      if (s.indexOf('T') !== -1) {
        return s.split('T')[0];
      } else {
        return s;
      }
    } else {
      console.log('getDateString error input :' + s);
      return s;
    }
  }

  // ------------------------------------------------------------------------------
  // specialClosingDates --- array of string, eg. ['2019-10-22', ...]
  // dow ---- string '0,1,2,3,4,5,6'
  // dt --- moment object
  isClosed(dt: moment.Moment, specialClosingDates: string[], dow: string) {
    if (specialClosingDates) { // has special close day
      if (specialClosingDates.find(d => moment(this.getDateString(d), 'YYYY-MM-DD').isSame(dt, 'day'))) {
        return true;
      } else {
        return !this.isOpeningDayOfWeek(dt, dow);
      }
    } else {
      return !this.isOpeningDayOfWeek(dt, dow);
    }
  }

  joinFind(query: any, options?: any): Promise<IDbMerchant[]> {
    return new Promise((resolve, reject) => {
      this.mallModel.find({}).then((malls: IDbMall[]) => {

        this.find(query, options).then((rs: IDbMerchant[]) => {
          rs.map((r: IDbMerchant) => {
            r.mall = malls.find((m: IDbMall) => m && r.mallId && m._id.toString() === r.mallId.toString());
          });

          resolve(rs);
        });
      });
    });
  }

  toBasicRspObject(r: IDbMerchant) {
    const mall: any = r.mall;

    const m: IMall = {
      _id: mall._id.toString(),
      name: mall.name,
      address: mall.address,
      placeId: mall.placeId,
      lat: mall.lat,
      lng: mall.lng,
      ranges: mall.ranges,
      status: mall.status,
      type: mall.type,
      pickupTimes: mall.pickupTimes
    }

    const merchant: IMerchant = {
      _id: r._id.toString(),
      name: r.name,
      nameEN: r.nameEN,
      description: r.description,
      accountId: r.accountId.toString(),
      mallId: r.mallId.toString(),
      address: r.address,
      closed: r.closed,
      dow: r.dow,
      mall: m,
      phases: r.phases,
      pictures: r.pictures,
      type: r.type,
      created: r.created,
      modified: r.modified,

      inRange: r.mall ? true : false, // is it in orange circle ? fix me

    }
    return merchant;
  }


  // origin --- can be null
  loadByDeliveryInfo(query: any, local: moment.Moment, origin?: ILocation): Promise<IMerchant[]> {

    return new Promise((resolve, reject) => {
      if (origin) {
        this.areaModel.getArea(origin).then((area: IArea) => {
          const dow: number = local.day();

          if (area && area._id) {
            this.mallModel.getScheduledMallIds(area._id.toString(), dow).then((scheduledMallIds: any[]) => {
              this.joinFind(query).then((ms: IDbMerchant[]) => {
                // if (area.code === 'DT') {
                //   const merchants: IMerchant[] = [];

                //   ms.map((r: IDbMerchant) => {
                //     const mall: any = r.mall;
                //     const scheduledMallId = scheduledMallIds.find((mId: any) => mId.toString() === mall._id.toString());
                //     const merchant = this.toBasicRspObject(r);

                //     merchant.onSchedule = scheduledMallId ? true : false;
                //     merchant.distance = area.distance; // km
                //     merchant.orderEnded = this.isOrderEnded(moment(), local, area, r.phases);
                //     merchant.orderEndTime = this.getOrderEndTime(r.phases, area);
                //     merchant.isClosed = this.isClosed(local, r.closed, r.dow);
                //     merchants.push(merchant);
                //   });
                //   resolve(merchants);
                // } else {
                this.mallModel.getRoadDistanceToMalls(origin).then((ds: IDistance[]) => {
                  const merchants: IMerchant[] = [];

                  ms.map((r: IDbMerchant) => {
                    const mall: any = r.mall;
                    const d = ds.find(x => x.destinationPlaceId === mall.placeId);
                    const scheduledMallId = scheduledMallIds.find((mId: any) => mId.toString() === mall._id.toString());
                    const merchant = this.toBasicRspObject(r);

                    merchant.onSchedule = scheduledMallId ? true : false;
                    merchant.distance = d ? Math.round((d.element.distance.value / 1000) * 100) / 100 : 0;
                    merchant.orderEnded = this.isOrderEnded(moment(), local, area, r.phases);
                    merchant.orderEndTime = this.getOrderEndTime(r.phases, area);
                    merchant.isClosed = this.isClosed(local, r.closed, r.dow);
                    merchants.push(merchant);
                  });
                  resolve(merchants);
                });
                // }
              });
            });
          } else {
            resolve([]);
          }
        });
      } else { // no origin
        this.joinFind(query).then((ms: IDbMerchant[]) => {
          const merchants: IMerchant[] = [];

          ms.map((r: IDbMerchant) => {
            const merchant = this.toBasicRspObject(r);

            merchant.onSchedule = true;
            merchant.distance = 0;
            merchant.orderEnded = false;
            merchant.orderEndTime = this.getOrderEndTime(r.phases),
              merchant.isClosed = false;

            merchants.push(merchant);
          });
          resolve(merchants);
        });
      }
    });
  }



  // myLocalTime --- eg. '2020-04-23T23:12:00'
  // return local time list [{ date: 'YYYY-MM-DD', time:'HH:mm' }]
  async getDeliverSchedule(myLocalTime: string, merchantId: string, lat: number, lng: number, appType=AppType.GROCERY){
    const merchant = await this.findOne({ _id: merchantId });
    const dt = new DateTime();
    if (merchant.delivers) {
      const myUtc = moment.utc().toISOString();
      const myLocalDateTime = dt.getMomentFromUtc(myUtc).format('YYYY-MM-DD HH:mm:ss');
      return this.scheduleModel.getSpecialSchedule(myLocalDateTime, merchant.delivers);
    } else {
      const schedule = await this.scheduleModel.getAvailableSchedule(merchantId, lat, lng, appType);
      if (schedule && merchant) {
        const orderEndList = merchant.rules.map((r: any) => r.orderEnd);
        const dows = schedule.rules.map((r: any) => +r.deliver.dow);
        const bs = this.scheduleModel.getLatestMatchDateList(myLocalTime, orderEndList, dows);
  
        const deliverTimeMap: any = {};
        schedule.rules.forEach((r: any) => {
          deliverTimeMap[r.deliver.time] = true;
        });
        const timeList = Object.keys(deliverTimeMap);
        return this.scheduleModel.expandDeliverySchedule(bs, timeList);
      } else {
        return [];
      }
    }
  }

}