/// <reference types="cypress" />

describe('Manager Finansów - CRUD', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173/');
    cy.get('[data-testid="manager-module"]').click();
  });

  it('Dodanie nowego wpisu', () => {
    cy.contains('Dodaj wiersz').click();
    cy.get('tbody tr input').eq(0).type('Testowy wpis');
    cy.get('tbody tr input').eq(1).type('111.11');
    cy.get('tbody tr input').eq(2).type('Testowa kategoria');
    cy.get('tbody tr input').eq(3).type('2025-04-21');
    cy.contains('✓').click();
    cy.contains('Testowy wpis').should('exist');
  });

  it('Edycja wpisu', () => {
    cy.contains('Testowy wpis').parent().parent().within(() => {
      cy.get('td').eq(0).click();
      cy.get('input').clear().type('Zmieniony wpis').blur();
    });
    cy.contains('Zmieniony wpis').should('exist');
  });

  it('Usunięcie wpisu', () => {
    cy.contains('Zmieniony wpis').parent().parent().within(() => {
      cy.get('button[title="Usuń"]').click();
    });
    cy.contains('Zmieniony wpis').should('not.exist');
  });
});
