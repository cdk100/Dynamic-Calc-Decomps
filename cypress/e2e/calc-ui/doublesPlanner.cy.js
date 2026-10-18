describe('Native doubles workspace', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.viewport(1440, 1000)
    cy.visit('./index.html?data=9aa37533b7c000992d92&gen=5&types=5')
  })

  it('keeps the original calculator and only shows the workspace in doubles mode', () => {
    cy.get('#calculator-view').should('be.visible')
    cy.get('#doubles-workspace').should('exist').and('not.be.visible')

    cy.get('#doubles-format').check({ force: true })
    cy.get('#doubles-workspace').should('be.visible')
    cy.contains('Doubles workspace').should('be.visible')

    cy.get('#singles-format').check({ force: true })
    cy.get('#doubles-workspace').should('not.be.visible')
  })

  it('uses the existing party and trainer rosters for the second active slots', () => {
    cy.get('#doubles-format').check({ force: true })

    cy.window().then((win) => {
      win.currentParty = ['Bulbasaur', 'Ivysaur']
      win.localStorage.currentParty = 'Bulbasaur,Ivysaur'
      win.CURRENT_TRAINER_POKS = [
        'Charmander (Trainer)[0]',
        'Charmeleon (Trainer)[1]'
      ]
      if (typeof win.refreshDoublesWorkspace === 'function') {
        win.refreshDoublesWorkspace()
      }
    })

    cy.get('#dw-player2 option').should('have.length.greaterThan', 0)
    cy.get('#dw-enemy2 option').should('have.length.greaterThan', 0)
  })

  it('shows speed order and both directions of matchup output', () => {
    cy.get('#doubles-format').check({ force: true })
    cy.get('.dw-speed').should('contain.text', 'Speed order')
    cy.get('.dw-matchup-card').should('have.length', 2)
    cy.contains('.dw-matchup-card', 'Your attacks').should('exist')
    cy.contains('.dw-matchup-card', 'Enemy attacks').should('exist')
  })

  it('can reset only the doubles secondary slots without touching the base calculator', () => {
    cy.get('#doubles-format').check({ force: true })
    cy.get('#p1 .set-selector').invoke('val').then((before) => {
      cy.get('#dw-reset').click()
      cy.get('#p1 .set-selector').invoke('val').should('eq', before)
    })
  })
})
