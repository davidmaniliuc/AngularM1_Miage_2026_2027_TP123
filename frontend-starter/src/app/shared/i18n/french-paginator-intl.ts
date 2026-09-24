import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';

/** French labels for mat-paginator ("Pistes par page", "1 à 5 sur 6"…). */
@Injectable()
export class FrenchPaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Pistes par page';
  override nextPageLabel = 'Page suivante';
  override previousPageLabel = 'Page précédente';
  override firstPageLabel = 'Première page';
  override lastPageLabel = 'Dernière page';

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0) return '0 sur 0';
    const start = page * pageSize + 1;
    const end = Math.min(start + pageSize - 1, length);
    return `${start} à ${end} sur ${length}`;
  };
}
