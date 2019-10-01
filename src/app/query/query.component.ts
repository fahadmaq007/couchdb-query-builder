import { Component, OnInit, Inject, ViewChild } from '@angular/core';
import { AppService } from '../shared/app.service';
import { DbInfo } from '../shared/dbinfo.model';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material';
import { ClipboardService } from 'ngx-clipboard'
import { SelectionModel } from '@angular/cdk/collections';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-query',
  templateUrl: './query.component.html',
  styleUrls: ['./query.component.css']
})
export class QueryComponent implements OnInit {

  metadata: any = {};
  objectKeys = Object.keys;
  private dbClientUrl: string;
  selectedFilters: any[] = [];
  _idFilter: any = { "field": "_id", "operation": "$eq" };
  dbs: DbInfo[];
  dataSource = new MatTableDataSource<any>();
  // MatPaginator Output
  page: any = { pageIndex: 0, pageSize: 50, length: 0 };
  pageLength: number;
  isLoading: boolean = false;
  selection = new SelectionModel<any>(true, []);
  displayedColumns: string[] = [];
  filters: any[] = [];
  downloadJsonHref: SafeUrl;
  dbInfo: any;
  selectedRowIndex: number;
 
  highlight(row) {
    this.selectedRowIndex = row.id;
  }
  constructor(private appService: AppService, private snackBar: MatSnackBar,
    private clipboardService: ClipboardService, private sanitizer: DomSanitizer) {

  }

  @ViewChild(MatPaginator) paginator: MatPaginator;

  /**
   * Set the paginator after the view init since this component will
   * be able to query its view for the initialized paginator.
   */
  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
  }

  ngOnInit() {
    this.loadSettings();
  }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const rowsLength = this.dataSource.data.length;
    return numSelected === rowsLength;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggle() {
    console.log("this.isAllSelected(): " + this.isAllSelected());
    this.isAllSelected() ? 
    this.selection.clear() : this.selectRows();
  }

  selectRows() {
    for (let index = 0; index < this.dataSource.data.length; index++) {
      this.selection.select(this.dataSource.data[index]);
    }
  }

  select(row): void {
    this.selection.select(row);
  }

  loadAllDbs(): void {
    this.appService.listAllDbs().subscribe((dbs: Array<DbInfo>) => {
      this.dbs = this.appService.filterUnderscoreDbs(dbs);
      if (this.metadata.selectedDb) {
        var index = this.dbs.indexOf(this.metadata.selectedDb);
        if (index == -1) {
          this.metadata.selectedDb = this.dbs[0] + "";
        }
      } else {
        this.metadata.selectedDb = this.dbs[0] + "";
      }
      
      this.onDbChange();
    }, (err) => {
      console.error("ERRROR: ", err);
      this.showError("Could not connect to " + this.metadata.couchUrl);
    });
  }
  
  applyFilter(filterValue: string) {
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  public onDbChange(): void {
    console.log("onDbChange" + this.metadata.selectedDb);
    this.appService.setSelectedDb(this.metadata.selectedDb);
    this.appService.getDbInfo(this.metadata.selectedDb).subscribe((info: any) => {
      console.log("dbInfo", info);
      this.dbInfo = info;
    });
    this.mergeFilters();
    var columns = ['select'].concat(this.metadata.fields);
    var db = this.metadata.selectedDb;
    if (this.metadata.dbs) {
      if (this.metadata.dbs[this.metadata.selectedDb] && this.metadata.dbs[this.metadata.selectedDb].fields) {
        columns = columns.concat(this.metadata.dbs[this.metadata.selectedDb].fields);
      }
      if (this.metadata.dbs[db] && this.metadata.dbs[db].name) {
        db = this.metadata.dbs[db].name;
      }
    }
    
    this.displayedColumns = columns;
    console.log('displayedColumns: ' + this.metadata.selectedDb, this.displayedColumns);
    
    this.showMessage("Database changed to " + db);
    this.clearFilterSelection();
  }

  private getDbFilters(db: string): any[] {
    var dbConf = this.metadata.dbs[db];
    var dbFilters: any[] = [];
    if (dbConf) {
      return dbConf.filters;
    }
    return dbFilters;
  }

  private mergeFilters(): void {
    var filters = this.appService.clone(this.metadata.filters);
    if (this.metadata.dbs && this.metadata.selectedDb) {
      var dbFilters = this.getDbFilters(this.metadata.selectedDb);
      if (dbFilters) {
        filters = dbFilters.concat(filters);
      }
      if (this.metadata.dbs[this.metadata.selectedDb]) {
        var associatedDbs = this.metadata.dbs[this.metadata.selectedDb].associatedDbs;
        if (associatedDbs) {
          associatedDbs.forEach(db => {
            dbFilters = this.getDbFilters(db);
            if (dbFilters) {
              filters = dbFilters.concat(filters);
            }
          });
        }
      }
    }
    this.filters = filters;
  }

  private loadSettings(): any {
    this.appService.initializeMeta().subscribe(metadata => {
      this.metadata = metadata;
      console.log("Query loadMeta", this.metadata)
      this.loadAllDbs();
    });
  }

  executeQuery(): void {
    if (!this.selectedFilters.length) {
      this.dataSource.data = [];
      return;
    }
    this.isLoading = true;
    this.dbClientUrl = this.appService.getDbClientUrl();
    var page = this.page;
    this.appService.executeQuery(this.selectedFilters, undefined, page).subscribe(data => {
      var docs = data["docs"];
      this.dataSource.data = docs;
      this.pageLength = docs.length < page.pageSize ? docs.length : page["length"];  
      this.isLoading = false;
    });
  }

  private showMessage(msg): void {
    this.snackBar.open(msg, undefined, {
      duration: 2000,
    });
  }

  private showError(msg): void {
    this.snackBar.open(msg, undefined, {
      duration: 5000,
      panelClass: "error"
    });
  }
  private removeAlreadyPresentFilter(filters, filter): void {
    if (filters.length > 0) {
      for (let index = 0; index < filters.length; index++) {
        const each = filters[index];
        if (each.field == filter.field) {
          filters.splice(index, 1);
          break;
        }
      }
    }
  }
  onFilterChanged(filter): void {
    delete filter.$$edit;
    var index = this.selectedFilters.indexOf(filter);
    if (filter.selected) {
      if (index == -1) {
        this.removeAlreadyPresentFilter(this.selectedFilters, filter);
        this.selectedFilters.push(filter);
      }
    } else {
      if (index > -1) {
        this.selectedFilters.splice(index, 1);
      }
    }
    delete filter.selected;
    console.log("onFilterChanged", filter);
    this.resetPage();
    this.executeQuery();
  }

  resetPage(): void {
    this.page.pageIndex = 0;
  }
  clearFilterSelection(): void {
    this.selectedFilters = [];
    this.dataSource.data = [];
  }

  copyDocumentId(): void {
    this.selectedFilters = [];
    this.selectedFilters.push(this._idFilter);
    this.executeQuery();
  }

  showDocumentById(): void {
    this.selectedFilters = [];
    this.selectedFilters.push(this._idFilter);
    this.executeQuery();
    this.selectedFilters = [];
  }

  copySelectors(): void {
    var length = this.selectedFilters.length;
    if (length == 0) {
      return;
    }
    var qObject = this.appService.prepareQueryObject(this.selectedFilters, undefined, this.page);
    var text = JSON.stringify(qObject);
    this.clipboardService.copyFromContent(text);
    this.showMessage("Copied Text");
  }

  concatenate(field): void {
    const numSelected = this.selection.selected.length;
    var data = this.dataSource.data;
    if (numSelected > 0) {
      data = this.selection.selected;
    }
    var ids = "";
    if (!field) {
      field = "_id";
    }
    if (data) {
      for (var i = 0; i < data.length; i++) {
        var each = data[i];
        var value = each[field];
        if (ids.indexOf(value) == -1) {
          ids += "\"" + value + "\", ";
        }
      }
      ids = ids.substring(0, ids.lastIndexOf(","));
      this.clipboardService.copyFromContent(ids);
      this.showMessage("Copied Text");
    }
  }

  private getCopiedData(): string {
    const numSelected = this.selection.selected.length;
    var data = this.dataSource.data;
    if (numSelected > 0) {
      data = this.selection.selected;
    }

    var text = "";
    if (data) {
      if (data.length == 1) {
        text = JSON.stringify(data[0]);
      } else {
        for (var i = 0; i < data.length; i++) {
          var each = data[i];
          var value = JSON.stringify(data[i]);
          text += value + ", ";
        }
        text = "[" + text.substring(0, text.lastIndexOf(",")) + "]";
      }
    }
    return text;
  }
  copyDocuments(): void {
    var text = this.getCopiedData();
    this.clipboardService.copyFromContent(text);
    const numSelected = this.selection.selected.length;
    this.showMessage("Copied " + numSelected + " Document(s)");
  }

  onpage(event): void {
    console.log(event);
    this.page = event;
    this.executeQuery();
  }

  generateDownloadJsonUri() {
    var text = this.getCopiedData();
    var uri = this.sanitizer.bypassSecurityTrustUrl("data:text/json;charset=UTF-8," + encodeURIComponent(text));
    this.downloadJsonHref = uri;
  }

  onCouchUrlChanged(): void {
    var url = this.metadata.couchUrl;
    console.log("Couch URL changed " + url);
    // this.dbInfo = undefined;
    this.loadAllDbs();
  }

  nextPage(): void {
    var page = this.page;
    if (page.pageIndex >= 0) {
      page.pageIndex++;
      console.log("fetching next page " + page.pageIndex);
      this.executeQuery();
    }
  }

  prevPage(): void {
    var page = this.page;
    if (page.pageIndex >= 1) {
      page.pageIndex--;
      console.log("fetching prev page " + page.pageIndex);
      this.executeQuery();
    }
  }

  firstPage(): void {
    this.resetPage();
    console.log("fetching first page " + this.page.pageIndex);
    this.executeQuery();
  }

  showCount(key: string): void {
    var pageSize = this.dbInfo ? this.dbInfo.doc_count : 1000;
    var page = { pageIndex : 0, pageSize: pageSize };
    var fields = ["_id"];
    var start = new Date().getTime();
    var qObject = {startkey: "\"" + key + "\"", endkey: "\"" + key + "\ufff0\"", limit: pageSize, inclusive_end: true };
    this.appService.allDocs(qObject).subscribe(data => {
      if (data && data["rows"]) {
        // this.dataSource.data = data["rows"];
        this.showMessage("There are " + data["rows"].length + " documents");
        this.appService.showRunTime(start, "");
      }
    });
  }
}