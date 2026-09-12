"""CLI Entrypoint for Scheduled Adherence Report Delivery (Phase 11 Step 7).

Primary execution mechanism for automated weekly and monthly report dispatches.
Can be triggered via cron, task scheduler, or manual CLI invocation:

    python -m app.scripts.send_scheduled_reports --period weekly
    python -m app.scripts.send_scheduled_reports --period monthly

Supports deterministic testing via explicit flags:
    --reference-date YYYY-MM-DD
    --start-date YYYY-MM-DD --end-date YYYY-MM-DD --allow-custom-dates
"""

import argparse
import asyncio
from datetime import date
import logging
import sys
from typing import Optional

from app.db.mongodb import close_mongo_connection, connect_to_mongo
from app.services.scheduled_report_service import ScheduledReportService

# Configure clean logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("meditrack.cli.scheduled_reports")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="MediTrack+ Scheduled Adherence Report Delivery CLI",
    )
    parser.add_argument(
        "--period",
        choices=["weekly", "monthly"],
        default="weekly",
        help="Reporting period type (default: weekly)",
    )
    parser.add_argument(
        "--start-date",
        type=str,
        default=None,
        help="Explicit start date (YYYY-MM-DD). If omitted, completed period is calculated.",
    )
    parser.add_argument(
        "--end-date",
        type=str,
        default=None,
        help="Explicit end date (YYYY-MM-DD). If omitted, completed period is calculated.",
    )
    parser.add_argument(
        "--reference-date",
        type=str,
        default=None,
        help="Reference 'today' date (YYYY-MM-DD) for completed period calculation.",
    )
    parser.add_argument(
        "--allow-custom-dates",
        action="store_true",
        default=False,
        help="Allow custom date ranges for testing without enforcing completed-period policy.",
    )
    return parser.parse_args()


async def run_cli(args: argparse.Namespace) -> int:
    """Execute scheduled report delivery with database lifecycle management."""
    logger.info("Starting MediTrack+ Scheduled Adherence Report Delivery CLI...")
    try:
        await connect_to_mongo()

        ref_d: Optional[date] = None
        if args.reference_date:
            ref_d = date.fromisoformat(args.reference_date.strip())

        service = ScheduledReportService()
        summary = await service.execute_scheduled_run(
            period=args.period,
            reference_date=ref_d,
            start_date=args.start_date,
            end_date=args.end_date,
            allow_custom_dates=args.allow_custom_dates,
        )

        print("\n" + "=" * 64)
        print(" MediTrack+ Scheduled Adherence Report Delivery Summary")
        print("=" * 64)
        print(f" Period:             {summary.period.upper()}")
        print(f" Delivery Window:    {summary.start_date} to {summary.end_date}")
        print(f" Total Eligible:     {summary.total_eligible}")
        print(f" Successfully Sent:  {summary.sent_count}")
        print(f" Skipped:            {summary.skipped_count}")
        print(f" Failed:             {summary.failed_count}")
        print("=" * 64 + "\n")

        for r in summary.results:
            details = f" - [{r.status.upper()}] ({r.recipient_role}) {r.recipient_email} -> deliveryKey: {r.delivery_key}"
            if r.skip_reason:
                details += f" (Reason: {r.skip_reason})"
            if r.error_message:
                details += f" (Error: {r.error_message})"
            print(details)

        if summary.failed_count > 0:
            logger.warning("Completed with %d delivery failures.", summary.failed_count)
            return 1

        logger.info("Scheduled delivery completed successfully.")
        return 0

    except Exception as exc:
        sanitized_err = ScheduledReportService._sanitize_error(str(exc))
        logger.error("Fatal error during scheduled report delivery: %s", sanitized_err)
        return 1
    finally:
        await close_mongo_connection()


def main():
    args = parse_args()
    exit_code = asyncio.run(run_cli(args))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
