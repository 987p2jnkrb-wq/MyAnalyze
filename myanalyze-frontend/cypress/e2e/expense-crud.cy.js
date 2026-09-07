/// <reference types="cypress" />

describe('Wydatki - CRUD', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173/');
    cy.get('[data-testid="expense-module"]').click();
  });

  it('Dodanie nowego wydatku', () => {
    cy.contains('Dodaj wiersz').click();
    cy.get('tbody tr input').eq(0).type('Testowy wydatek'); // Nazwa
    cy.get('tbody tr input').eq(1).type('123.45'); // Kwota
    cy.get('tbody tr input').eq(2).type('Jedzenie'); // Kategoria
    cy.get('tbody tr input').eq(3).type('2025-04-21'); // Data
    cy.contains('✓').click();
    cy.contains('Testowy wydatek').should('exist');
  });

  it('Edycja wydatku', () => {
    cy.contains('Testowy wydatek').parent().parent().within(() => {
      cy.get('td').eq(0).click(); // Nazwa
      cy.get('input').clear().type('Zmieniony wydatek').blur();
    });
    cy.contains('Zmieniony wydatek').should('exist');
  });

  it('Usunięcie wydatku', () => {
    cy.contains('Zmieniony wydatek').parent().parent().within(() => {
      cy.get('button[title="Usuń"]').click();
    });
    cy.contains('Zmieniony wydatek').should('not.exist');
  });
});
