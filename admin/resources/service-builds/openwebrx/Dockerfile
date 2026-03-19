FROM slechev/openwebrxplus:latest

COPY patch_openwebrx.py /tmp/patch_openwebrx.py

RUN python3 /tmp/patch_openwebrx.py && rm -f /tmp/patch_openwebrx.py
