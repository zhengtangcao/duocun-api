import { DB } from "../db";
import { Model } from "./model";
import { Area, AppType } from "./area";
import {DateTime} from "./date-time";

const N_WEEKS = 1;

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




  // private
  // s -- time string from databse, eg. 9:8
  // return 09:08:00
  patchTime(s: string) {
    const [h, m] = s.split(':').map(x => +x);
    return (h > 9 ? h : '0' + h) + ':' + (m > 9 ? m : '0' + m) + ':00';
  }



  // private
  // myLocalTime -- local time string eg.'2020-03-23T23:58:00'
  // orderEndList -- week and local time array eg. [{dow:2, time:'10:00'}, {dow:3, time:'23:59'}, {dow:5, time: '23:59'}]
  // deliverDowList -- weeks eg.[2,4,6]
  // return list of local time string 
  getLatestMatchDateList(myLocalTime: string, orderEndList: any[], deliverDowList: number[]) {
    const myLocalDate = myLocalTime.split('T')[0];
    const dt = new DateTime();

    const orderEnds: any[] = []; // moment
    orderEndList.map(oe => {
      const n = +oe.dow;
      const t = this.patchTime(oe.time); // eg. 09:00 for meat shop
      const localOrderEndTime = myLocalDate + 'T' + t;
      orderEnds.push(dt.getMomentFromLocal(localOrderEndTime).day(n));    // current
      orderEnds.push(dt.getMomentFromLocal(localOrderEndTime).day(n + 7)); // next
    });

    const latestOrderEnd = dt.getLatestMoment(myLocalTime, orderEnds);
    const delivers: any[] = [];

    deliverDowList.map(dow => {
      const n = +dow;
      // const dt = myLocalDate + 'T00:00:00';
      const current = dt.getMomentFromLocal(myLocalTime).day(n);
      const next = dt.getMomentFromLocal(myLocalTime).day(n + 7);
      const other = dt.getMomentFromLocal(myLocalTime).day(n + 14);

      if (current.isAfter(latestOrderEnd)) {
        delivers.push(current);
      } else if (next.isAfter(latestOrderEnd)) {
        delivers.push(next);
      } else {
        delivers.push(other);
      }
    });

    const sorted = delivers.sort((a, b) => {
      if (a.isAfter(b)) {
        return 1;
      } else {
        return -1;
      }
    });

    return sorted.map(b => b.format('YYYY-MM-DDTHH:mm:ss'));
  }

  // private
  // myLocalTime -- local time string eg.'2020-03-23T23:58:00'
  // delivers --- special deliver date time, '2020-03-31T11:20'
  // orderEndList --- [{dow:'1', 'time':'23:59' }]
  // return local time list [{ date: 'YYYY-MM-DD', time:'HH:mm' }]
  getSpecialSchedule(myLocalTime: string, orderEndList: any[], delivers: string[]) {
    const ds: any[] = [];
    const dt = new DateTime();
    const myLocalDate = myLocalTime.split('T')[0];

    const orderEnds: any[] = []; // moment
    orderEndList.map(oe => {
      const n = +oe.dow;
      const t = this.patchTime(oe.time); // eg. 09:00 for meat shop
      const localOrderEndTime = myLocalDate + 'T' + t;
      orderEnds.push(dt.getMomentFromLocal(localOrderEndTime).day(n));    // current
      orderEnds.push(dt.getMomentFromLocal(localOrderEndTime).day(n + 7)); // next
    });

    delivers.map((d: string) => {
      const s = d + ':00';
      const orderEnd = dt.getLatestMoment(myLocalTime, orderEnds); // get end date after my local time
      // const orderEnd = dt.getMomentFromLocal(s).add(-1, 'days');
      const deliver = dt.getMomentFromLocal(s);
      ds.push({ orderEnd, deliver });
    });

    const rs = ds.filter(m => m && m.orderEnd.isAfter(dt.getMomentFromLocal(myLocalTime)));
    return rs.map(r => {
      return { date: r.deliver.format('YYYY-MM-DD'), time: r.deliver.format('HH:mm') };
    });
  }

  // baseList --- local time list ['2020-03-24T00:00:00']
  // deliverTimeList eg. ['11:20']
  // return local time list [{ date: 'YYYY-MM-DD', time:'HH:mm' }]
  expandDeliverySchedule(baseList: any[], deliverTimeList: any[]) {
    const list: any[] = [];
    const dt = new DateTime();
    if (baseList && baseList.length > 0) {
      for (let i = 0; i < N_WEEKS; i++) {
        const dateList = baseList.map(b => dt.getMomentFromLocal(b).add(7 * i, 'days').format('YYYY-MM-DD'));
        dateList.map(d => {
          deliverTimeList.map(t => {
            list.push({ date: d, time: t });
          });
        });
      }
      return list;
    } else {
      return list;
    }
  }


  async getAvailableSchedule(merchantId: string, lat: number, lng: number, appType=AppType.GROCERY){
    const area = await this.areaModel.getMyArea({lat, lng}, appType);
    if(area){
      const areaId = area._id.toString();
      return this.findOne({merchantId, areaId});
    }else{
      return null;
    }
  }
}