/**
 * Client dell'API di Skudo.
 *
 * Vive **solo** nel contesto di sfondo, perché è l'unico posto in cui il token
 * viene letto. Il content script e il popup non chiamano l'API: mandano un
 * messaggio.
 *
 * L'estensione di addy.io ha diciassette `fetch(` sparsi fra il componente
 * Vue, il background e il content script, ciascuno con la propria gestione
 * degli errori. Qui c'è un punto solo: quando l'API cambia, cambia qui.
 */

import { INSTANCE } from './config.js'

/** L'API risponde entro pochi secondi o non risponde. */
const TIMEOUT_MS = 15000

export class ApiError extends Error {
  constructor(message, { code = 'ERROR', status = 0 } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export class SkudoApi {
  /**
   * @param {{token: string}} config
   */
  constructor({ token }) {
    this.token = token
  }

  async request(path, { method = 'GET', body } = {}) {
    if (!this.token) throw new ApiError('Not signed in', { code: 'UNAUTHENTICATED' })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let response
    try {
      response = await fetch(`${INSTANCE}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${this.token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        // Nessun cookie: l'autenticazione è il token e basta. Mandare anche i
        // cookie di sessione renderebbe queste richieste vulnerabili a CSRF
        // e legherebbe l'estensione a una sessione del browser che non
        // controlliamo.
        credentials: 'omit',
      })
    } catch (error) {
      clearTimeout(timer)
      if (error.name === 'AbortError') {
        throw new ApiError('The server took too long to answer', { code: 'TIMEOUT' })
      }
      throw new ApiError('Could not reach the server', { code: 'NETWORK' })
    }
    clearTimeout(timer)

    const data = await response.json().catch(() => ({}))

    if (response.ok) return data

    throw this.describeFailure(response.status, data)
  }

  /**
   * Messaggi leggibili invece del codice di stato.
   *
   * Chi legge questi messaggi sta compilando un modulo su un altro sito e vuole
   * sapere se può andare avanti o no, non quale numero ha risposto il server.
   */
  describeFailure(status, data) {
    if (status === 401) {
      return new ApiError('Your Skudo sign-in has expired. Open the extension to sign in again.', {
        code: 'UNAUTHENTICATED',
        status,
      })
    }
    if (status === 403) {
      return new ApiError(data.message || 'You have reached your alias limit on this domain.', {
        code: 'FORBIDDEN',
        status,
      })
    }
    if (status === 429) {
      return new ApiError('Too many aliases created in the last hour. Try again shortly.', {
        code: 'RATE_LIMITED',
        status,
      })
    }
    if (status === 422 && data.errors) {
      const first = Object.values(data.errors)[0]
      return new ApiError(Array.isArray(first) ? first[0] : 'That did not validate.', {
        code: 'INVALID',
        status,
      })
    }
    return new ApiError(data.message || 'Something went wrong.', { code: 'ERROR', status })
  }

  /**
   * @param {{domain: string, format: string, localPart?: string, description?: string}} options
   */
  async createAlias({ domain, format, localPart = '', description = '' }) {
    const { data } = await this.request('/api/v1/aliases', {
      method: 'POST',
      body: {
        domain,
        format,
        local_part: localPart || undefined,
        description: description || undefined,
      },
    })
    return data
  }

  async updateAlias(id, { description }) {
    const { data } = await this.request(`/api/v1/aliases/${id}`, {
      method: 'PATCH',
      body: { description },
    })
    return data
  }

  async deleteAlias(id) {
    await this.request(`/api/v1/aliases/${id}`, { method: 'DELETE' })
  }

  /**
   * Gli alias già esistenti che riguardano un sito.
   *
   * È quello che rende possibile proporre il riuso su un modulo di accesso
   * invece di creare l'ennesimo indirizzo inutile. Funziona perché alla
   * creazione mettiamo il dominio del sito nella descrizione.
   */
  async findAliasesForSite(site) {
    const params = new URLSearchParams({
      'filter[search]': site,
      'filter[deleted]': 'without',
      'page[size]': '10',
      sort: '-created_at',
    })
    const { data } = await this.request(`/api/v1/aliases?${params}`)
    return data || []
  }

  async getDomainOptions() {
    const { data } = await this.request('/api/v1/domain-options')
    return data || []
  }

  /** Il token è valido? Usato solo al momento dell'accesso. */
  async verifyToken() {
    return this.request('/api/v1/account-details')
  }
}

/** @param {{local_part: string, extension?: string, domain: string}} alias */
export function aliasEmail(alias) {
  if (!alias) return ''
  return alias.extension
    ? `${alias.local_part}+${alias.extension}@${alias.domain}`
    : `${alias.local_part}@${alias.domain}`
}
