-- An unpaid receivable has no actual receipt date; preserve all existing dates.
ALTER TABLE capital_records ALTER COLUMN received_date DROP NOT NULL;
