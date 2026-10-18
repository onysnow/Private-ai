"""Investigation visuals: the order slip, the kitchen, the checker and the
drawing (design doc "Investigation Visuals & Presentation System", passes 2
and 3).

The AI writes an order (app/visuals/spec.py) that names a chart kind and a
catalogued query, never a number. The data service (data_service.py) runs
that query against this investigation's own records and tags every value
with the records it came from; stats.py computes the numbers a chart adds
to them (shares, histogram bins, outliers). The checker (checker.py) tests
the chart against the data and the 20 design rules. The option builder
(echarts.py) draws it in the house style, and the render client
(render_client.py) turns that drawing into an image for PowerPoint and Word.
"""
