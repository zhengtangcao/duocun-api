import { Component, OnInit, Input } from '@angular/core';
import { SharedService } from '../../shared/shared.service';

@Component({
    selector: 'app-admin-order-list',
    templateUrl: './admin-order-list.component.html',
    styleUrls: ['./admin-order-list.component.scss']
})
export class AdminOrderListComponent implements OnInit {
    @Input() orders;

    constructor(private sharedSvc: SharedService) { }

    ngOnInit() {

    }

    getTotal(order) {
        return this.sharedSvc.getTotal(order.items);
    }

    toDateTimeString(s) {
        return this.sharedSvc.toDateTimeString(s);
    }
}

