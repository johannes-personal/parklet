export function ReviewForm({ action, idName, id, error }: { action: (fd: FormData) => Promise<void>; idName: string; id: string; error?: boolean }) {
  return (
    <form action={action} className="card space-y-4 p-5">
      <h2 className="font-semibold">Beslut</h2>
      <input type="hidden" name={idName} value={id} />
      <div>
        <label htmlFor="note" className="label">
          Motivering till uthyraren (krävs vid avslag)
        </label>
        <textarea id="note" name="note" rows={3} className="input" placeholder="T.ex. Hyresavtalet saknar platsnummer. Ladda upp ett avtal där platsen framgår." />
        {error ? <p className="field-error">Skriv en motivering när du inte godkänner.</p> : null}
      </div>
      <div className="flex gap-3">
        <button name="decision" value="approve" className="btn-primary">
          Godkänn
        </button>
        <button name="decision" value="reject" className="btn-danger">
          Avslå / begär komplettering
        </button>
      </div>
    </form>
  );
}
