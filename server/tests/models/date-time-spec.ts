import { DateTime } from "../../models/date-time";
import { expect } from 'chai';
// import moment from "../../../node_modules/moment";
// import { Config } from "../../config";
// import { ILocation } from "../../models/distance";

describe('getMomentFromLocal', () => {
  it('should format date to Local date', () => {
    const dt = new DateTime();
    const datas = [
      { s: '2019-11-03T13:52:59', ret: '2019-11-03T13:52:59' },
    ];

    datas.map(d => {
      const m = dt.getMomentFromLocal(d.s);
      expect(m.format('YYYY-MM-DDTHH:mm:ss')).to.equal(d.ret);
    });
  });


  it('getLatest should be 03-25', () => {
    const dt = new DateTime();
    const myDateTime = '2020-03-25T23:58:00';
    const ms = [
      dt.getMomentFromLocal('2020-03-24T23:59:00'), 
      dt.getMomentFromLocal('2020-03-25T23:59:00'),
      dt.getMomentFromLocal('2020-03-27T23:59:00')
    ];
    const date = dt.getLatestMoment(myDateTime, ms);
    expect(date.format('YYYY-MM-DD')).to.equal('2020-03-25');
  });

  it('getLatest should be 03-27', () => {
    const dt = new DateTime();
    const myDateTime = '2020-03-25T23:58:00.000Z';
    const ms = [
      dt.getMomentFromLocal('2020-03-24T23:59:00'),
      dt.getMomentFromLocal('2020-03-27T23:59:00')
    ];
    const date = dt.getLatestMoment(myDateTime, ms);
    expect(date.format('YYYY-MM-DD')).to.equal('2020-03-27');
  });

  
});
