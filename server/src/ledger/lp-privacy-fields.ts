// Free fields and owned containers in the evidence-consuming DTOs; containers keep their shape.
export const lpDerivedFields = {
  workflowDiligence: ['note','detail','summary','description','content','text','remarks','sections','body','html','markdown','title','opinion','reason','conclusion','decisions','requirements','history'],
  deal: ['template','requiredAgreements','review','signed','confirmations','closing','responsibility','duties','schedules','conditions'],
  postInvestment: ['analysis','followUps','category','basis','source','missingReasons','quote','sourceLocation','obligation','threshold','resolution'],
  postReport: ['missing','reportName','fileName','downloadFileName','watermark','sources'],
  exitPreparation: ['priceReason','pricingBasis','counterparty','strategy','documents','location'],
  cashflowSettlement: ['bankAccount','bankReference','cancellation','reversal'],
  returns: ['revisionReason','cashflows','terms','explanation','derivationText','coverage','scope','expected','terminalValue'],
  assetHistory: ['completionReview'],
} as const;
export const lpDerivedFieldSet = new Set<string>(Object.values(lpDerivedFields).flat());
export const lpNumericFields = new Set(['amount','valuation','share','portion','consideration','revenue','netProfit','netAssets','employees','principal','income','invested','received','outstanding','remainingPortion','disposedPortion','contracted','tolerance','lowerRateBound','upperRateBound','irr','moic','netCash','expectedIrr','expectedMoic']);
