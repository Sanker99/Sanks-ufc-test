-- Anonymous historical aggregates; no visitor identifiers or raw search text.
CREATE TABLE IF NOT EXISTS activity_totals (day TEXT NOT NULL,category TEXT NOT NULL,label TEXT NOT NULL,state TEXT NOT NULL DEFAULT '',count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,category,label,state));
