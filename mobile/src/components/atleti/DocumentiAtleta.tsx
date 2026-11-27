// Scheda Documenti dell'area atleti (#view-documenti di atleta.html): certificato medico, quote e pagamenti
// (con il riepilogo in PDF), ricevute di pagamento (in PDF), modulo di iscrizione.
import { Linking, StyleSheet, Text, View } from 'react-native';

import { IBAN, IBAN_LEGGIBILE, TastoCopiaIban } from '~/components/atleti/HomeAtleta';
import { Distintivo, Icona, Scheda, TastoLeggero, al, stili as base } from '~/components/atleti/Pezzi';
import { dataIso, dataIt, driveVista, type Atleta, type Rata } from '~/lib/atleti';
import { SITO } from '~/lib/dati';
import { badgeCertificato, sottoQuote, statoRata } from '~/lib/documentiAtleta';
import { eur, fmtDate, type Ricevuta } from '~/lib/ricevutaDoc';
import { fonts } from '~/lib/theme';

export const MODULO_ISCRIZIONE = SITO + '/assets/modulo-tesseramento.pdf';

type Props = {
  atleta: Atleta;
  rate: Rata[];
  rateErrore: boolean;
  ricevute: Ricevuta[];
  ricevuteErrore: boolean;
  /** Messaggi d'errore dei PDF (#ratePdfMsg, #ricMsg). */
  msgRate: string;
  msgRicevute: string;
  adesso: Date;
  riepilogoPdf: () => void;
  ricevutaPdf: (r: Ricevuta) => void;
};

function Testa({ icona, colore, titolo, sotto }: { icona: 'documenti' | 'fatto'; colore: string; titolo: string; sotto: string }) {
  return (
    <View style={base.testaScheda}>
      <View style={base.iconaScheda}>
        <Icona nome={icona} misura={22} colore={colore} />
      </View>
      <View style={stili.testaTesto}>
        <Text style={base.titoloScheda} accessibilityRole="header">
          {titolo}
        </Text>
        <Text style={base.sottoScheda}>{sotto}</Text>
      </View>
    </View>
  );
}

const Errore = ({ testo }: { testo: string }) =>
  testo ? (
    <Text style={stili.errore} accessibilityRole="alert">
      {testo}
    </Text>
  ) : null;

export function DocumentiAtleta({ atleta, rate, rateErrore, ricevute, ricevuteErrore, msgRate, msgRicevute, adesso, riepilogoPdf, ricevutaPdf }: Props) {
  const cert = badgeCertificato(atleta.certMedicoScadenza, adesso);
  const pdfCert = driveVista(atleta.certMedicoUrl);
  const moduloAllegato = driveVista(atleta.moduloIscrizioneUrl);
  const oggi = dataIso(adesso);

  return (
    <View style={stili.vista}>
      <Scheda>
        <Testa icona="documenti" colore={al.blu} titolo="Certificato Medico" sotto="Idoneità sportiva agonistica" />
        <View style={base.corpo}>
          <View style={stili.certRiga}>
            <Text style={stili.certEtichetta}>Scadenza</Text>
            <Text style={stili.certValore}>{atleta.certMedicoScadenza ? dataIt(atleta.certMedicoScadenza) : 'Non inserita'}</Text>
            {cert ? <Distintivo tipo={cert.tipo} testo={cert.testo} /> : null}
          </View>
          {pdfCert ? (
            <View style={stili.spazio}>
              <TastoLeggero icona="documenti" testo="Apri PDF" onPress={() => void Linking.openURL(pdfCert)} />
            </View>
          ) : null}
          <Text style={stili.nota}>La società darà info a breve su come organizzarsi per il certificato medico.</Text>
        </View>
      </Scheda>

      <Scheda>
        <Testa icona="fatto" colore={al.verde} titolo="Quote e Pagamenti" sotto={sottoQuote(rate)} />
        <View style={base.corpo}>
          {rate.length ? (
            <View style={stili.azioneTesta}>
              <TastoLeggero icona="documenti" testo="Riepilogo PDF" onPress={riepilogoPdf} />
            </View>
          ) : null}
          <Errore testo={msgRate} />
          <View style={stili.pagare}>
            <Text style={stili.pagareTitolo}>Come pagare</Text>
            <Text style={stili.testo}>
              Bonifico bancario a favore di <Text style={stili.forte}>A.S.D. VICTOR VOLLEY</Text>
            </Text>
            <View style={stili.iban}>
              <Text style={stili.ibanValore} selectable accessibilityLabel={'IBAN ' + IBAN}>
                {IBAN_LEGGIBILE}
              </Text>
              <TastoCopiaIban />
            </View>
            <Text style={stili.testo}>
              <Text style={stili.forte}>Causale.</Text> Nome e cognome dell’atleta e la tranche che stai pagando (1ª, 2ª o 3ª). Solo la 1ª tranche comprende
              anche i costi di iscrizione, che si pagano una volta sola.
            </Text>
          </View>
          {rate.length ? (
            <View style={stili.lista}>
              {rate.map((r, i) => {
                const s = statoRata(r, oggi);
                return (
                  <View key={i} style={[stili.voce, r.pagata && stili.voceSaldata]}>
                    <View style={stili.info}>
                      <Text style={stili.desc}>{r.descrizione || 'Quota'}</Text>
                      {r.scadenzaPagamento ? <Text style={stili.data}>Pagamento entro: {dataIt(r.scadenzaPagamento)}</Text> : null}
                      <Text style={stili.data}>Valida fino al: {r.scadenza ? dataIt(r.scadenza) : '—'}</Text>
                    </View>
                    <View style={stili.destra}>
                      <Text style={stili.importo}>€{(Number(r.importo) || 0).toFixed(2)}</Text>
                      <Distintivo tipo={r.pagata ? 'green' : 'red'} testo={s.testo} />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={base.spento}>{rateErrore ? 'Non è stato possibile caricare le quote. Riprova più tardi.' : 'Nessuna quota inserita.'}</Text>
          )}
        </View>
      </Scheda>

      <Scheda>
        <Testa icona="fatto" colore={al.verde} titolo="Ricevute di pagamento" sotto="Scarica le ricevute dei pagamenti effettuati" />
        <View style={base.corpo}>
          <Errore testo={msgRicevute} />
          {ricevute.length ? (
            <View style={stili.lista}>
              {ricevute.map((r) => {
                const annullata = r.stato === 'annullata';
                return (
                  <View key={r.id} style={[stili.voce, !annullata && stili.voceSaldata]}>
                    <View style={stili.info}>
                      <Text style={stili.desc}>Ricevuta {r.numero}</Text>
                      <Text style={stili.data}>
                        {fmtDate(r.data)} · {r.causale || r.tipoIncasso || ''}
                      </Text>
                    </View>
                    <View style={stili.destra}>
                      <Text style={stili.importo}>{eur(r.importo)}</Text>
                      {annullata ? <Distintivo tipo="red" testo="Annullata" /> : null}
                      <TastoLeggero testo="Scarica PDF" onPress={() => ricevutaPdf(r)} />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={base.spento}>
              {ricevuteErrore ? 'Non è stato possibile caricare le ricevute. Riprova più tardi.' : 'Nessuna ricevuta disponibile.'}
            </Text>
          )}
        </View>
      </Scheda>

      <Scheda>
        <Testa icona="documenti" colore={al.arancio} titolo="Modulo di Iscrizione" sotto="Stagione corrente" />
        <View style={base.corpo}>
          <Text style={stili.testo}>
            <Text style={stili.forte}>Come si consegna.</Text> Scarica il modulo, compilalo e firmalo. Va consegnato{' '}
            <Text style={stili.forte}>a mano, firmato, a un dirigente</Text> della società: non va inviato online.
          </Text>
          <View style={stili.spazio}>
            <TastoLeggero icona="documenti" testo="Scarica il modulo (PDF)" onPress={() => void Linking.openURL(MODULO_ISCRIZIONE)} />
          </View>
          {moduloAllegato ? (
            <View style={stili.allegato}>
              <Text style={stili.testo}>La società ha già allegato il modulo di questo atleta:</Text>
              <TastoLeggero icona="documenti" testo="Apri il modulo allegato" onPress={() => void Linking.openURL(moduloAllegato)} />
            </View>
          ) : null}
        </View>
      </Scheda>
    </View>
  );
}

const stili = StyleSheet.create({
  vista: { gap: 20 },
  testaTesto: { flex: 1 },
  errore: { fontFamily: fonts.corpoMedio, fontSize: 13, color: '#B91C1C', marginBottom: 12 },
  certRiga: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  certEtichetta: { fontFamily: fonts.corpo, fontSize: 13, color: al.spento },
  certValore: { fontFamily: fonts.titolo, fontSize: 18, color: al.testo },
  spazio: { marginTop: 14, flexDirection: 'row' },
  nota: { marginTop: 14, fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19.5, color: al.spento },
  azioneTesta: { flexDirection: 'row', marginBottom: 14 },
  pagare: { marginBottom: 16, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  pagareTitolo: { fontFamily: fonts.corpoForte, fontSize: 13, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  testo: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19.5, color: al.testo, marginVertical: 8 },
  forte: { fontFamily: fonts.corpoForte },
  iban: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  ibanValore: { fontFamily: 'monospace', fontSize: 14, letterSpacing: 0.5, color: al.testo },
  lista: { gap: 10 },
  voce: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: al.bordo, backgroundColor: '#FAFAFA' },
  voceSaldata: { opacity: 0.65 },
  info: { flex: 1, minWidth: 0 },
  desc: { fontFamily: fonts.corpoForte, fontSize: 14, color: al.testo },
  data: { fontFamily: fonts.corpo, fontSize: 12, color: al.spento, marginTop: 2 },
  destra: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  importo: { fontFamily: fonts.titolo, fontSize: 18, color: al.testo },
  allegato: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: al.bordo },
});
