import {useState} from 'react';
import {OwnerProjection} from '../components/OwnerProjection';
import {isExactSrIdentity} from '../state/sr-identity';

type Observation = Readonly<{value_state: string; value: unknown}>;
type ServiceRequestPoint = Readonly<{
  service_request_id: string;
  identity: Readonly<{official_sr_no: string | null; local_sr_no: string | null}>;
  revision: number;
  source_projection: Readonly<{fields: Readonly<Record<string, Observation>>}> | null;
  reference_context: Readonly<{customer: unknown}>;
  warnings: readonly string[];
}>;

const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function acceptedDetail(value: ServiceRequestPoint): ServiceRequestPoint {
  if (!value || !UUID4.test(value.service_request_id) ||
    !Number.isSafeInteger(value.revision) || value.revision < 1 ||
    !value.identity || (!isExactSrIdentity(value.identity.official_sr_no ?? value.identity.local_sr_no ?? '')) ||
    !Array.isArray(value.warnings) ||
    !value.source_projection && value.source_projection !== null) {
    throw new Error('Invalid Service Request owner projection');
  }
  return value;
}
function sourceText(item: ServiceRequestPoint, field: string): string {
  const source = item.source_projection?.fields?.[field];
  return source?.value_state === 'usable' && typeof source.value === 'string' &&
    source.value.trim() && source.value.length <= 512 ? source.value : 'Not reported';
}

/** Honest temporary identity entry until the LLD-03 bounded collection API is composed. */
export function TicketCollection({navigate}: {navigate: (path: string) => void}) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState<string | null>(null);
  const valid = isExactSrIdentity(input);
  return <section className="soma-v2-ticket-collection" aria-label="Service Requests">
    <div className="soma-v2-ticket-toolbar">
      <div>
        <h2>Service Requests</h2>
        <p>Exact owner identity lookup · No live collection index is composed yet</p>
      </div>
    </div>
    <form className="soma-v2-ticket-search" onSubmit={event=>{
      event.preventDefault();if(valid)setQuery(input);
    }}>
      <label htmlFor="soma-v2-sr-lookup">Official SR (8 digits) or local SR (LSR-########)</label>
      <div className="soma-v2-ticket-search-controls">
        <input id="soma-v2-sr-lookup" value={input} maxLength={12} autoComplete="off"
          spellCheck={false} placeholder="12345678 or LSR-00000001"
          onChange={event=>{setInput(event.target.value);setQuery(null);}}
          aria-invalid={input.length > 0 && !valid ? 'true' : undefined}/>
        <button type="submit" disabled={!valid}>Find exact SR</button>
      </div>
      {input.length>0&&!valid&&<p role="status">Enter an exact 8-digit SR or LSR-######## identity.</p>}
    </form>
    {query && <OwnerProjection<ServiceRequestPoint> path={
      '/api/v1/tickets/service-requests/by-business-id/' + encodeURIComponent(query)
    } render={raw=>{
      const ticket=acceptedDetail(raw);
      const display=ticket.identity.official_sr_no ?? ticket.identity.local_sr_no;
      return <div className="soma-v2-ticket-match">
        <div className="soma-v2-ticket-match-heading">EXACT MATCH · OWNER-ACCEPTED RECORD</div>
        <div className="soma-v2-ticket-match-grid">
          <span>SR</span><strong>{display}</strong>
          <span>Customer</span><span>{ticket.reference_context?.customer ? 'Linked customer reference' : 'Unresolved'}</span>
          <span>Summary</span><span>{sourceText(ticket,'problem_summary')}</span>
          <span>Source status</span><span>{sourceText(ticket,'status')}</span>
          <span>Revision</span><span>{ticket.revision}</span>
        </div>
        {ticket.warnings.length>0&&<p role="status">{ticket.warnings.length} owner review warning(s). Inspect the full workbench.</p>}
        <button type="button" data-focus-token="tickets:lookup:open"
          onClick={()=>navigate('/tickets/sr/'+encodeURIComponent(ticket.service_request_id))}>Open Service Request ↗</button>
      </div>;
    }}/>}
    <p className="soma-v2-ticket-collection-scope">
      Full Active / All / Archived lists, counts and filters require the owning Tickets collection query.
      This lookup neither infers a complete result set nor creates, changes or archives tickets.
    </p>
  </section>;
}
