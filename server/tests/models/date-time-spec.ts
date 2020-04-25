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
});
