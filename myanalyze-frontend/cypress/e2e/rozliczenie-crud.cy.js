/// <reference types="cypress" />

describe('Bieżące Rozliczenie - CRUD', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173/');
    cy.get('[data-testid="rozliczenie-module"]').click();
  });

  it('Dodanie nowego wpisu', () => {
    cy.contains('Dodaj wiersz').click();
    cy.get('tbody tr input').eq(0).type('Testowa pozycja');
    cy.get('tbody tr input').eq(1).type('222.22');
    cy.get('tbody tr input').eq(2).type('Testowa kategoria');
    cy.get('tbody tr input').eq(3).type('2025-04-21');
    cy.contains('✓').click();
    cy.contains('Testowa pozycja').should('exist');
  });

  it('Edycja wpisu', () => {
    cy.contains('Testowa pozycja').parent().parent().within(() => {
      cy.get('td').eq(0).click();
      cy.get('input').clear().type('Zmieniona pozycja').blur();
    });
    cy.contains('Zmieniona pozycja').should('exist');
  });

  it('Usunięcie wpisu', () => {
    cy.contains('Zmieniona pozycja').parent().parent().within(() => {
      cy.get('button[title="Usuń"]').click();
    });
    cy.contains('Zmieniona pozycja').should('not.exist');
  });
});
