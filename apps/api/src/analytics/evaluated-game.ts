// One game that can actually be used to score the model: it has a final
// result AND the predictor had written a GamePrediction for it. Both halves
// are required — a finished game with no prediction says nothing about the
// model, and a predicted game that hasn't been played has no answer to check
// against.
//
// This is a plain read-model, deliberately flattened away from Prisma's
// nested Game/GamePrediction shape, so the arithmetic in
// ModelAccuracyService can be unit-tested from literals with no database and
// no Prisma types in the way.
export interface EvaluatedGame {
  // The Game row's id — carried so a caller debugging an odd figure can go
  // back to the specific game it came from.
  gameId: string;

  // Tip-off. Compared against predictionCreatedAt to tell a genuine
  // before-the-fact prediction from one written after the result was known.
  gameDate: Date;

  // Final score, both non-null by construction (see EvaluatedGamesService).
  homeScore: number;
  awayScore: number;

  // The model's probability, in [0, 1], that the HOME team wins — the single
  // number every figure in the accuracy report is scored against.
  homeWinProbability: number;

  // When the prediction row was written. GamePrediction is upserted by
  // predict_games.py, so this is the last write, not necessarily the first.
  predictionCreatedAt: Date;
}
